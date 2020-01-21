const utilRedis = require('../db/redis.js');

setOracle = (web3) => new Promise(async (resolve, reject) => {
    try {
        const wallet = await web3.eth.accounts.create();
        await utilRedis.setKeyValueDB(wallet.address, wallet.privateKey);
        resolve(wallet.address);
    } catch (error) {
        console.log('ERROR - setOracle: ' + error);
        reject(new Error("setOracle:", error));
    }
});

getOracleCredentials = (address) => new Promise(async (resolve, reject) => {
    try {
        const credentials = await utilRedis.getKeyValueDB(address);
        if (credentials === null) {
            reject(new Error('ERROR: Oracle credentials does not exists, INPUT ADDRESS =' + address))
        }
        resolve(credentials);
    } catch (error) {
        reject(new Error('ERROR - getOracleCredentials | INPUT address:' + address + ', Error msg:' + error));
    }
});

setFreeOracle = (address) => new Promise(async (resolve, reject) => {
    try {
        await utilRedis.setKeyValueDB('credentials', address);
        resolve(true);
    } catch (error) {
        console.log('ERROR - setFreeOracle: ' + error);
        console.log('INPUT: ' + address);
        reject(error);
    }
});

module.exports = {
    setOracle,
    getOracleCredentials,
    setFreeOracle
};