#!/usr/bin/env node
import { App, Tags } from 'aws-cdk-lib';
import { demoDomain } from './config.js';
import { DemoStack } from './demo-stack.js';

const app = new App();
const stage = app.node.tryGetContext('stage') ?? 'prod';
if (stage !== 'prod' && stage !== 'dev') throw new Error('stage must be prod or dev');
const env = { account: process.env.CDK_DEFAULT_ACCOUNT, region: process.env.CDK_DEFAULT_REGION ?? 'eu-south-1' };
if (env.region !== 'eu-south-1') throw new Error('The reviewed OpenTesoro demo target is eu-south-1');
const domain = demoDomain(app.node.tryGetContext('domainName'), app.node.tryGetContext('hostedZoneId'), app.node.tryGetContext('certificateArn'), env.account);
new DemoStack(app, `OpenTesoro-${stage}-Demo`, { env, domain, terminationProtection: stage === 'prod', description: 'OpenTesoro isolated public synthetic per-visitor memory demo' });
Tags.of(app).add('Application', 'opentesoro');
Tags.of(app).add('Environment', stage);
Tags.of(app).add('DataClassification', 'synthetic-demo');
Tags.of(app).add('ManagedBy', 'cdk');
