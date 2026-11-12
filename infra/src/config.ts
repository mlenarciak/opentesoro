export interface DemoDomain { domainName: string; hostedZoneId: string; certificateArn: string }

export function demoDomain(domain: unknown, zone: unknown, certificate: unknown, account?: string): DemoDomain | undefined {
  const supplied = [domain, zone, certificate].filter(value => value !== undefined).length;
  if (!supplied) return undefined;
  if (supplied !== 3) throw new Error('domainName, hostedZoneId and certificateArn must be supplied together');
  if (typeof domain !== 'string' || domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(domain)) throw new Error('domainName must be a fully qualified hostname without scheme, wildcard or trailing dot');
  if (typeof zone !== 'string' || !/^Z[A-Z0-9]{1,32}$/.test(zone)) throw new Error('hostedZoneId must be an existing Route 53 public hosted zone ID');
  const match = typeof certificate === 'string' && /^arn:aws:acm:us-east-1:([0-9]{12}):certificate\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.exec(certificate);
  if (!match || (account && match[1] !== account)) throw new Error('certificateArn must be an issued ACM certificate in us-east-1 in the deployment account');
  return { domainName: domain.toLowerCase(), hostedZoneId: zone, certificateArn: certificate as string };
}

/** Redirect before the SPA loads so browser session cookies and CSRF origin agree. */
export function canonicalRedirectCode(domain: string): string {
  return `function handler(event) {
    var request = event.request;
    if (request.headers.host.value === ${JSON.stringify(domain)}) return request;
    var pairs = [];
    var query = request.querystring || {};
    for (var key in query) {
      var values = query[key].multiValue || [query[key]];
      for (var i = 0; i < values.length; i++) pairs.push(key + '=' + values[i].value);
    }
    return { statusCode: 302, statusDescription: 'Found', headers: {
      location: { value: 'https://' + ${JSON.stringify(domain)} + request.uri + (pairs.length ? '?' + pairs.join('&') : '') },
      'cache-control': { value: 'no-store' }
    } };
  }`;
}
