# Payment Service API

### Prerequisites

```
NodeJS (8+)
5 running IPFS nodes
Running REDIS database instance
```

### Installing


Clone this repo:

```
git clone URI
```

Inside folder, run:

```
npm i
```

Set values in config.js

```
const redisParameters = {
  url: 'REDIS URL',
}
const ipfsParameters = {
  host: 'IPFS URL',
  port: 'PORT',
  protocol: 'PROTOCOL'
};
const ethereumNetwork = {
  rpcUrlws: 'RPC WEBSOCKET URL',
  rpcUrl: 'RPC URL',
  gasPrice: 10000000000
};
```

You may run an app now:

```
npm start
```