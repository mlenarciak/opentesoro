import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import { App, aws_ecs as ecs } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { canonicalRedirectCode, demoDomain } from '../src/config.js';
import { DemoStack } from '../src/demo-stack.js';

const env = { account: '111111111111', region: 'eu-south-1' };
const certificateArn = 'arn:aws:acm:us-east-1:111111111111:certificate/12345678-1234-1234-1234-123456789abc';
const image = ecs.ContainerImage.fromRegistry(`example.invalid/opentesoro@sha256:${'a'.repeat(64)}`);
function fixture(domain?: ReturnType<typeof demoDomain>) {
  const app = new App({ outdir: mkdtempSync(path.join(os.tmpdir(), 'opentesoro-infra-')) });
  const stack = new DemoStack(app, 'OfflineOpenTesoro', { env, image, domain, terminationProtection: true });
  return { app, stack, template: Template.fromStack(stack) };
}

test('default publication is isolated and requires no owned domain or persistent financial storage', () => {
  const { app, template: t } = fixture();
  t.resourceCountIs('AWS::CloudFront::VpcOrigin', 1);
  t.resourceCountIs('AWS::CloudFront::Distribution', 1);
  t.resourceCountIs('AWS::EC2::VPC', 1);
  t.resourceCountIs('AWS::EC2::Subnet', 4);
  t.resourceCountIs('AWS::EC2::NatGateway', 0);
  t.resourceCountIs('AWS::EFS::FileSystem', 0);
  t.resourceCountIs('AWS::DynamoDB::Table', 0);
  t.resourceCountIs('AWS::RDS::DBInstance', 0);
  t.resourceCountIs('AWS::SecretsManager::Secret', 0);
  t.resourceCountIs('AWS::Route53::RecordSet', 0);
  t.resourceCountIs('AWS::CertificateManager::Certificate', 0);
  t.hasResourceProperties('AWS::ElasticLoadBalancingV2::LoadBalancer', { Scheme: 'internal', LoadBalancerAttributes: Match.arrayWith([{ Key: 'access_logs.s3.enabled', Value: 'true' }]) });
  t.hasResourceProperties('AWS::CloudFront::VpcOrigin', { VpcOriginEndpointConfig: Match.objectLike({ HTTPPort: 80, OriginProtocolPolicy: 'http-only' }) });
  t.hasResourceProperties('AWS::ECS::Service', { DesiredCount: 1, EnableExecuteCommand: false, NetworkConfiguration: { AwsvpcConfiguration: { AssignPublicIp: 'ENABLED', SecurityGroups: Match.anyValue(), Subnets: Match.anyValue() } }, DeploymentConfiguration: Match.objectLike({ DeploymentCircuitBreaker: { Enable: true, Rollback: true }, MinimumHealthyPercent: 0, MaximumPercent: 100 }) });
  t.hasResourceProperties('AWS::ECS::TaskDefinition', { Cpu: '512', Memory: '1024', NetworkMode: 'awsvpc', Volumes: Match.absent(), ContainerDefinitions: Match.arrayWith([Match.objectLike({ User: '1000:1000', ReadonlyRootFilesystem: true, VersionConsistency: 'enabled', MountPoints: Match.absent(), Secrets: Match.absent() })]) });
  const task = Object.values(t.findResources('AWS::ECS::TaskDefinition'))[0].Properties;
  const appContainer = task.ContainerDefinitions[0];
  const variables = Object.fromEntries(appContainer.Environment.map((e: { Name: string; Value: unknown }) => [e.Name, e.Value]));
  assert.equal(variables.HOST, '0.0.0.0');
  assert.equal(variables.PORT, '3000');
  assert.equal(variables.STATIC_DIR, '/app/web');
  assert.equal(variables.PUBLIC_DEMO_MAX_SESSIONS, '32');
  assert.equal(variables.PUBLIC_DEMO_MAX_DB_PAGES, '512');
  assert.equal(variables.PUBLIC_DEMO_MAX_BODY_BYTES, '131072');
  assert.ok(JSON.stringify(variables.PUBLIC_DEMO_ORIGIN).includes('DomainName'), 'origin uses this distribution, not ALB host/scheme');
  for (const name of ['DATABASE_PATH', 'OPENTESORO_API_TOKEN', 'OPENTESORO_READ_ONLY_TOKEN', 'AGICAP_CLIENT_ID', 'AGICAP_CLIENT_SECRET']) assert.equal(variables[name], undefined, name);
  const taskRoleId = task.TaskRoleArn['Fn::GetAtt'][0];
  const taskPolicies = Object.values(t.findResources('AWS::IAM::Policy')).filter(r => JSON.stringify(r.Properties.Roles).includes(taskRoleId));
  assert.equal(taskPolicies.length, 0, 'application role has no AWS API/data/secret permissions');
  const rules = Object.values(t.findResources('AWS::EC2::SecurityGroupIngress')).map(r => r.Properties);
  assert.equal(rules.length, 2);
  assert.ok(rules.every(rule => rule.SourceSecurityGroupId && !rule.CidrIp && !rule.CidrIpv6), 'both origin and application ingress require source security groups');
  assert.deepEqual(rules.map(r => r.FromPort).sort((a, b) => a - b), [80, 3000]);
  assert.ok(rules.every(r => r.FromPort === r.ToPort));
  assert.ok(JSON.stringify(rules.find(r => r.FromPort === 80)).includes('SecurityGroups.0.GroupId'), 'ALB permits the looked-up CloudFront managed SG only');
  const groups = Object.values(t.findResources('AWS::EC2::SecurityGroup'));
  assert.ok(groups.every(group => !group.Properties.SecurityGroupIngress), 'standalone ingress rules prevent distribution/SG cycles');
  const assembly = app.synth();
  assert.equal(assembly.stacks.length, 1, 'no dependencies on existing DLT/OpenFatture stacks');
  assert.equal(assembly.stacks[0].terminationProtection, true);
});

test('CloudFront preserves visitor session boundaries and never turns API errors into a cached SPA response', () => {
  const { app, template: t } = fixture();
  const config = Object.values(t.findResources('AWS::CloudFront::Distribution'))[0].Properties.DistributionConfig;
  assert.equal(config.DefaultCacheBehavior.CachePolicyId, '4135ea2d-6df8-44a3-9df3-4b5a84be39ad');
  assert.equal(config.DefaultCacheBehavior.OriginRequestPolicyId, 'b689b0a8-53d0-40ab-baf2-68738e2966ac');
  assert.equal(config.DefaultCacheBehavior.ViewerProtocolPolicy, 'redirect-to-https');
  assert.deepEqual(config.DefaultCacheBehavior.AllowedMethods, ['GET', 'HEAD', 'OPTIONS', 'PUT', 'PATCH', 'POST', 'DELETE']);
  const policies = Object.values(t.findResources('AWS::CloudFront::ResponseHeadersPolicy'));
  assert.ok(JSON.stringify(policies).includes("connect-src 'self'"));
  const assets = config.CacheBehaviors.find((b: { PathPattern: string }) => b.PathPattern === '/assets/*');
  assert.equal(assets.CachePolicyId, '658327ea-f89d-4fab-a63d-7e88639e58f6');
  for (const status of [403, 404, 500, 503]) {
    const entry = config.CustomErrorResponses.find((e: { ErrorCode: number }) => e.ErrorCode === status);
    assert.equal(entry.ErrorCachingMinTTL, 0);
    assert.equal(entry.ResponseCode, undefined);
    assert.equal(entry.ResponsePagePath, undefined);
  }
  assert.equal(config.Aliases, undefined);
  assert.equal(config.ViewerCertificate?.AcmCertificateArn, undefined, 'default CloudFront certificate requires no supplied ACM resource');
  app.synth();
});

test('custom domains require complete reviewed existing resources and keep cookie origin canonical', () => {
  assert.equal(demoDomain(undefined, undefined, undefined), undefined);
  assert.throws(() => demoDomain('demo.example.com', undefined, certificateArn), /supplied together/);
  for (const domain of ['https://example.com', '*.example.com', 'localhost', 'example.com.']) assert.throws(() => demoDomain(domain, 'Z1234567890', certificateArn), /fully qualified/);
  assert.throws(() => demoDomain('demo.example.com', 'not-a-zone', certificateArn), /hosted zone/);
  assert.throws(() => demoDomain('demo.example.com', 'Z1234567890', certificateArn.replace('us-east-1', 'eu-south-1')), /us-east-1/);
  assert.throws(() => demoDomain('demo.example.com', 'Z1234567890', certificateArn, '222222222222'), /deployment account/);
  const domain = demoDomain('Demo.Example.com', 'Z1234567890', certificateArn, env.account)!;
  const { app, template: t } = fixture(domain);
  t.resourceCountIs('AWS::Route53::RecordSet', 2);
  t.resourceCountIs('AWS::Route53::HostedZone', 0);
  t.hasResourceProperties('AWS::CloudFront::Distribution', { DistributionConfig: Match.objectLike({ Aliases: ['demo.example.com'], ViewerCertificate: Match.objectLike({ AcmCertificateArn: certificateArn, MinimumProtocolVersion: 'TLSv1.2_2021' }) }) });
  const task = Object.values(t.findResources('AWS::ECS::TaskDefinition'))[0].Properties;
  assert.ok(task.ContainerDefinitions[0].Environment.some((e: { Name: string; Value: string }) => e.Name === 'PUBLIC_DEMO_ORIGIN' && e.Value === 'https://demo.example.com'));
  const request = { uri: '/movimenti', headers: { host: { value: 'd123.cloudfront.net' } }, querystring: { q: { value: 'cash%20flow' }, tag: { value: 'a', multiValue: [{ value: 'a' }, { value: 'b%2Bc' }] } } };
  const response = runInNewContext(canonicalRedirectCode(domain.domainName) + ';handler(event)', { event: { request } });
  assert.equal(response.headers.location.value, 'https://demo.example.com/movimenti?q=cash%20flow&tag=a&tag=b%2Bc');
  assert.equal(response.headers['cache-control'].value, 'no-store');
  app.synth();
});

test('Docker staging allowlists required source and ignores local databases, credentials, tests and generated files in its hash', () => {
  const root = mkdtempSync(path.join(os.tmpdir(), 'opentesoro-context-'));
  const files = {
    'Dockerfile.public-demo': 'FROM scratch\n', '.dockerignore': '**/*.sqlite\n', 'package.json': '{}', 'bun.lock': '{}', 'tsconfig.json': '{}',
    LICENSE: 'Synthetic test license', 'THIRD_PARTY_NOTICES.md': 'Synthetic test notices',
    'apps/server/package.json': '{}', 'apps/server/src/public-demo-index.ts': 'export {};',
    'apps/web/package.json': '{}', 'apps/web/src/main.tsx': 'export {};',
    'packages/engine/package.json': '{}', 'packages/engine/src/index.ts': 'export {};',
    'packages/sdk/package.json': '{}', 'packages/sdk/src/index.ts': 'export {};',
    'packages/agicap/package.json': '{}', 'packages/agicap/src/index.ts': 'export {};',
  };
  const excluded = ['.data/demo.sqlite', 'apps/server/.data/unrelated.json', 'apps/server/src/private.key', 'apps/web/.env.production', 'apps/server/src/example.test.ts', 'apps/web/dist/index.html', 'infra/node_modules/dummy.js', 'docs/operations.md'];
  function write(file: string, data: string) { const target = path.join(root, file); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, data); }
  for (const [file, data] of Object.entries(files)) write(file, data);
  for (const file of excluded) write(file, 'SYNTHETIC EXCLUSION SENTINEL');
  function stage() {
    const app = new App({ outdir: mkdtempSync(path.join(os.tmpdir(), 'opentesoro-staging-')) });
    new DemoStack(app, 'AssetDemo', { env, sourceDirectory: root });
    const assembly = app.synth();
    const manifestFile = readdirSync(assembly.directory).find(file => file.endsWith('.assets.json'))!;
    const manifest = JSON.parse(readFileSync(path.join(assembly.directory, manifestFile), 'utf8'));
    const [hash, asset] = Object.entries(manifest.dockerImages)[0] as [string, { source: { directory: string } }];
    const directory = path.join(assembly.directory, asset.source.directory);
    for (const file of Object.keys(files)) assert.ok(existsSync(path.join(directory, file)), `${file} must be staged`);
    for (const file of excluded) assert.ok(!existsSync(path.join(directory, file)), `${file} must be excluded`);
    return hash;
  }
  const before = stage();
  for (const file of excluded) write(file, 'CHANGED SYNTHETIC EXCLUSION SENTINEL');
  assert.equal(stage(), before, 'local data/test/docs changes cannot invalidate or leak into the container asset');
});
