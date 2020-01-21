const ipfsClient = require('ipfs-http-client');
const { host, port, protocol } = require('../../config').ipfsParameters;
const ipfs = ipfsClient(host, port, { protocol: protocol });

const chalk = require('chalk');
const utilRedis = require('../db/redis.js');

publishIPNS = (ipfsHash, ipnsId) => new Promise(async (resolve, reject) => {
    try {
        console.log(chalk.blue('ENTERING: ') + `publishIPNS with args: ${ipfsHash}, ${ipnsId}`);
        const keyLocked = await utilRedis.getKeyValueDB(ipnsId);
        console.log(chalk.yellow('INFO: ') + `IPNS ID locked?: ${keyLocked}`);
        if (keyLocked === 'false') {
            await utilRedis.setKeyValueDB(ipnsId, true);
            console.log(chalk.yellow('INFO: ') + 'Publish to IPNS started:', ipfsHash, ipnsId);
            const saved = await ipfs.name.publish(ipfsHash, { key: ipnsId });
            console.log(chalk.green('SUCCESS: ') + 'IPNS RESULT: ', saved);
            await utilRedis.setKeyValueDB(ipnsId, false);
            resolve(saved);
        }
        reject(new Error(`IPNS with ${ipnsId} is locked`));
    } catch (error) {
        console.log(chalk.red('ERROR: ') + error);
        reject(new Error('publishIPNS:' + error));
    }
});

module.exports = {
    publishIPNS
};