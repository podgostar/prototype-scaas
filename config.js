const redisParameters = {
  url: 'redis://127.0.0.1:6379',
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


module.exports = {
  redisParameters,
  ipfsParameters,
  ethereumNetwork
};