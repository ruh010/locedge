# LocEdge

LocEdge is a CDN troubleshooting tool. It provides rich information about CDN edge servers (e.g. vendor, server geolocation, cache status, etc.) based on a given HTTP Archive file (HAR).

###### <a href="https://locedgex.web.app/">Demo Website</a>

### Getting Started

Install module from NPM:

```shell
npm i locedge
```

### API

`locedge(options)`

- `har`: HAR object to be parsed. `Required`
- `output`: Output directory.
- `trace`: Whether to perform `Traceroute` for a more accurate result. `Required` for certain providers, e.g. limelight. Default: `true`.
- `loglevel`: `info`, `warn`, or `error`. Default: `info` (verbose logging).
- `reserves`: Object describing fields and headers to reserve in the results.
  - `fields`: Array of fields in each entry
  - `responseFields`: Array of fields in `response`.
  - `responseHeaders`: Array of HTTP response headers.

##### Example:

```javascript
const har = require('har.json');
const locedge = require('locedge');

(async () => {
  const result = await locedge({
    har,
    output: '/example',
    trace: true,
    loglevel: 'info',
    reserves: {
      fields: ['time'],
    	responseFields: ['httpVersion'],
      responseHeaders: ['alt-svc']
    },
    traceOptions: {
      maxTTL: 36,
      protocol: 'ICMP', // ICMP or UDP
      timeout: 60000 // Traceroute timeout
    }
  })
})();
```

### Automated using Puppeteer

Use tools like <a href="https://github.com/cyrus-and/chrome-har-capturer">chrome-har-capturer</a> or <a href="https://github.com/Everettss/puppeteer-har">puppeteer-har</a> to record HAR files generated during web navigation

```javascript
const puppeteer = require('puppeteer');
const PuppeteerHar = require('puppeteer-har');
const locedge = require('locedge');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  const ph = new PuppeteerHar(page);
  await ph.start();

  await page.goto('http://example.com');

  const har = await ph.stop();
  await browser.close();
  
  const result = await locedge({ har });
  console.log(result);
})();
```