const { promisify } = require('util');
const redis = require('redis');
const redisParameters = require('../../config').redisParameters;
const chalk = require('chalk');

setKeyValueDB = (key, value) => new Promise(async (resolve, reject) => {
    try {
        console.log(chalk.blue('ENTERING: ') + 'setKeyValueDB function with params:');
        console.log(chalk.cyan('id: ' + key + ', lock: ' + value));
        const client = await redis.createClient(redisParameters.url);
        const setAsync = promisify(client.set).bind(client);
        await setAsync(key.toLowerCase(), value);
        client.end(true);
        // console.log(chalk.green('SUCCESS: ') + `Change value for key ${id} to ${lock}`);
        resolve(true);
    } catch (error) {
        reject(new Error('ERROR - setKeyValueDB: ' + error));
    }
});

getKeyValueDB = (key) => new Promise(async (resolve, reject) => {
    try {
        console.log(chalk.blue('ENTERING: ') + 'getKeyValueDB function with params');
        console.log(chalk.cyan('id: ' + key));
        const client = await redis.createClient(redisParameters.url);
        const getAsync = promisify(client.get).bind(client);
        const result = await getAsync(key.toLowerCase());
        client.end(true);
        resolve(result);
    } catch (error) {
        reject(new Error('ERROR - getKeyValueDB: ' + error));
    }
});

module.exports = {
    setKeyValueDB,
    getKeyValueDB
};