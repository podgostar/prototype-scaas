const express = require('express');
const router = express.Router();

var log4js = require('log4js');
var logger = log4js.getLogger();
logger.level = 'trace';

const config = require('../config.js');
const helper = require('../utils/helper');

const ipfsClient = require('ipfs-http-client');
const { host, port, protocol } = config.ipfsParameters;
const ipfs = ipfsClient(host, port, { protocol: protocol });

const ethUtil = require('ethereumjs-util');
const Web3 = require('web3');
const sigUtil = require('eth-sig-util');
const HDWalletProvider = require('truffle-hdwallet-provider');

const utilIpfs = require('../controller/ipfs/ipfs.js');
const utilRedis = require('../controller/db/redis.js');
const utilCredentials = require('../controller/util/credentials.js');

const scaasscBuild = require('../build/contracts/ScaaSSC.json');

const { rpcUrl, rpcUrlws, gasPrice } = config.ethereumNetwork;

router.post('/init', async (req, res) => {

    logger.debug(`Entering /init func with req.body: ${JSON.stringify(req.body)}`);

    let sender = req.body.sender.toLowerCase();
    let addressTwo = req.body.addressTwo.toLowerCase();
    let stake = req.body.stake;

    try {
        const oraclePercentage = 10;
        const channelStake = stake - ((stake / 100) * oraclePercentage);

        let paymentJSON = {
            addressa: sender,
            balancea: channelStake,
            addressb: addressTwo,
            balanceb: channelStake,
            prevstate: 0
        };

        logger.debug(`/init func with req.body: ${JSON.stringify(req.body)} success, res json: ${JSON.stringify(paymentJSON)}`);

        res.json(paymentJSON);
    } catch (error) {
        logger.error(`/init func with req.body: ${JSON.stringify(req.body)} - error: ${error}`)
        return res.status(400).end(error);
    }
});

router.post('/preopen', async (req, res) => {
    logger.debug(`Entering /preopen func with req.body: ${JSON.stringify(req.body)}`);

    let paymentJSON = req.body.json;
    let Signature = req.body.signature;

    try {

        let oracleAddress = await utilCredentials.setOracle(helper.getWeb3WS(rpcUrlws)); // kak je lahko tu že 0X000??


        logger.trace(`/preopen func - oracleAddress / utilCredentials.setOracle(): ${oracleAddress}`);

        const oraclePK = await utilCredentials.getOracleCredentials(oracleAddress); // vrži napako če ne dobiš
        logger.trace(`/preopen func - oraclePK / utilCredentials.getOracleCredentials(): ${oraclePK}`);

        paymentJSON.oracleAddress = oracleAddress; // v podpisovanje dodan tudi oracle address => samo pri odpiranju

        const signatureOracle = sigUtil.personalSign(ethUtil.toBuffer(oraclePK), { data: JSON.stringify(paymentJSON).toLowerCase() });
        logger.trace(`/preopen func - sigUtil.signatureOracle / personalSign: ${signatureOracle}`);

        let initJSON = {
            addressa: paymentJSON.addressa,
            balancea: paymentJSON.balancea, // stake
            addressb: paymentJSON.addressb,
            balanceb: paymentJSON.balanceb, // stake
            prevstate: paymentJSON.prevstate,
            signature: Signature,
            oraclesignature: signatureOracle
        };

        const keyName = ethUtil.keccak256(paymentJSON.addressb + paymentJSON.addressb + new Date().getTime().toString()).toString('hex');

        const ipnsId = await ipfs.key.gen(keyName, { type: 'rsa' });

        await utilRedis.setKeyValueDB(ipnsId.id, false);

        console.log(JSON.stringify(initJSON));

        const ipfsHash = await ipfs.add(new Buffer.from(JSON.stringify(initJSON)));

        const result = {
            ipnsId: ipnsId.id,
            ipfshHash: ipfsHash[0].path,
            oracleAddress: oracleAddress
        }

        logger.debug(`/preopen func with success, req.body: ${JSON.stringify(req.body)} + res.json: ${JSON.stringify(result)}`);
        res.json(result);

    } catch (error) {
        logger.error(`/preopen func with req.body: ${JSON.stringify(req.body)} - error: ${error}`)
        return res.status(400).end(error);
    }

});

router.post('/checkAndCreateChannel', async (req, res) => {
    logger.debug(`Entering /checkAndCreateChannel func with req.body: ${JSON.stringify(req.body)}`);

    try {
        let channelId = req.body.channelId;
        let ipfsHash = req.body.ipfsHash;

        const channel = await helper.artifactsToContract(helper.getWeb3WS(rpcUrlws), scaasscBuild);

        const channelInstance = await channel.deployed()
        const channelInfo = await channelInstance.getChannelInfo.call(channelId);

        const oracleAddress = channelInfo[0];
        const ipnsId = channelInfo[1];
        const addressA = channelInfo[2].toLowerCase();
        const addressB = channelInfo[3].toLowerCase();
        const balanceA = channelInfo[4].toNumber();
        const balanceB = channelInfo[5].toNumber();

        let paymentJSON = {
            addressa: addressA,
            balancea: balanceA,
            addressb: addressB,
            balanceb: balanceB,
            prevstate: 0,
            oracleAddress: oracleAddress
        };

        logger.trace(`/checkAndCreateChannel func - paymentJSON: ${JSON.stringify(paymentJSON)}`);

        const oraclePK = await utilCredentials.getOracleCredentials(oracleAddress); // // TU JE DOSTIKRAT ERROR KER MU ŽE V OSNOCI DA 0x000 notri

        const oracleSIG = sigUtil.personalSign(ethUtil.toBuffer(oraclePK), { data: JSON.stringify(paymentJSON).toLowerCase() });

        const ipfsFile = await ipfs.get(ipfsHash);

        const ipfsJSON = JSON.parse(ipfsFile[0].content.toString());

        if (ipfsJSON.oraclesignature === oracleSIG) {
            const result = await utilIpfs.publishIPNS(ipfsHash, ipnsId);

            logger.debug(`/checkAndCreateChannel func with req.body: ${JSON.stringify(req.body)} success, res json: ${JSON.stringify(result.data)}`);
            res.json(result.data);
        } else {
            logger.error(`/preopen func with req.body: ${JSON.stringify(req.body)} - error: Oracle signatures are not equal.`);
            return res.status(400).send('ERROR: Oracle signatures are not equal.');
        }

    } catch (error) {
        logger.error(`/preopen func with req.body: ${JSON.stringify(req.body)} - error: ${error}`);
        return res.status(400).end(error);
    }

});

router.post('/preSendPayment', async (req, res) => {
    logger.debug(`Entering /preSendPayment func with req.body: ${JSON.stringify(req.body)}`);

    let sender = req.body.sender.toLowerCase();
    let channelId = req.body.channelId;
    let amount = req.body.amount;

    try {
        const channel = await helper.artifactsToContract(helper.getWeb3WS(rpcUrlws), scaasscBuild);

        const channelInstance = await channel.deployed();

        const channelInfo = await channelInstance.getChannelInfo.call(channelId);

        if (channelInfo[6].toNumber() != 1) {
            logger.error(`/preSendPayment func with req.body: ${JSON.stringify(req.body)} - error: Channel is not in the right state.`);
            return res.status(400).send('ERROR: Channel is not in the right state.');
        }

        const ipfsHash = await ipfs.name.resolve(channelInfo[1]);
        const ipfsFile = await ipfs.get(ipfsHash);
        const ipfsJSON = JSON.parse(ipfsFile[0].content.toString().toLowerCase());

        if (ipfsJSON.addressa === sender || ipfsJSON.addressb === sender) {
            let proposedJSON = {
                addressa: ipfsJSON.addressa,
                balancea: ipfsJSON.balancea,
                addressb: ipfsJSON.addressb,
                balanceb: ipfsJSON.balanceb,
                prevstate: ipfsHash
            };
            if (ipfsJSON.addressa === sender) {
                if ((ipfsJSON.balancea - amount) >= 0) {
                    proposedJSON.balancea = ipfsJSON.balancea - amount;
                    proposedJSON.balanceb = ipfsJSON.balanceb + amount;
                } else {
                    logger.error(`/preSendPayment func with req.body: ${JSON.stringify(req.body)} - error: Insufficient funds.`);
                    return res.status(400).send('ERROR: Insufficient funds.');
                }
            } else {
                if ((ipfsJSON.balanceb - amount) >= 0) {
                    proposedJSON.balanceb = ipfsJSON.balanceb - amount;
                    proposedJSON.balancea = ipfsJSON.balancea + amount;
                } else {
                    logger.error(`/preSendPayment func with req.body: ${JSON.stringify(req.body)} - error: Insufficient funds.`);
                    return res.status(400).send('ERROR: Insufficient funds.');
                }
            }
            logger.debug(`/preSendPayment func with req.body: ${JSON.stringify(req.body)} success, res json: ${JSON.stringify(proposedJSON)}`);
            res.json(proposedJSON);
        } else {
            logger.error(`/preSendPayment func with req.body: ${JSON.stringify(req.body)} - error: Is not part of the payment channel.`);
            return res.status(400).send('ERROR: Is not part of the payment channel.');
        }
    } catch (error) {
        logger.error(`/preSendPayment func with req.body: ${JSON.stringify(req.body)} - error: ${error}`);
        return res.status(400).end(error);
    }
});

router.post('/checkAndSendPayment', async (req, res) => {
    logger.debug(`Entering /checkAndSendPayment func with req.body: ${JSON.stringify(req.body)}`);

    let signature = req.body.sig;
    let userSignedJSON = req.body.json;
    let channelId = req.body.channelId;
    let amount = req.body.amount;

    try {

        const channel = await helper.artifactsToContract(helper.getWeb3WS(rpcUrlws), scaasscBuild);

        const channelInstance = await channel.deployed();

        const channelInfo = await channelInstance.getChannelInfo.call(channelId);

        if (channelInfo[6].toNumber() != 1) {
            logger.error(`/checkAndSendPayment func with req.body: ${JSON.stringify(req.body)} - error: Channel is not in the right state.`);
            return res.status(400).send('ERROR: Channel is not in the right state.');
        }

        const ipfsHash = await ipfs.name.resolve(channelInfo[1]);

        const ipfsFile = await ipfs.get(ipfsHash);

        const ipfsJSON = JSON.parse(ipfsFile[0].content.toString().toLowerCase());

        const sender = sigUtil.recoverPersonalSignature({ data: JSON.stringify(userSignedJSON).toLowerCase(), sig: signature });

        if (ipfsJSON.addressa === sender || ipfsJSON.addressb === sender) {
            let oracleJSON = {
                addressa: ipfsJSON.addressa,
                balancea: ipfsJSON.balancea,
                addressb: ipfsJSON.addressb,
                balanceb: ipfsJSON.balanceb,
                prevstate: ipfsHash
            };
            if (ipfsJSON.addressa === sender) {
                if ((ipfsJSON.balancea - amount) >= 0) {
                    oracleJSON.balancea = ipfsJSON.balancea - amount;
                    oracleJSON.balanceb = ipfsJSON.balanceb + amount;
                } else {
                    logger.error(`/checkAndSendPayment func with req.body: ${JSON.stringify(req.body)} - error: Insufficient funds.`);
                    return res.status(400).send('ERROR: Insufficient funds.');
                }
            } else {
                if ((ipfsJSON.balanceb - amount) >= 0) {
                    oracleJSON.balanceb = ipfsJSON.balanceb - amount;
                    oracleJSON.balancea = ipfsJSON.balancea + amount;
                } else {
                    logger.error(`/checkAndSendPayment func with req.body: ${JSON.stringify(req.body)} - error: Insufficient funds.`);
                    return res.status(400).send('ERROR: Insufficient funds.');
                }
            }

            const oracleJSONstring = JSON.stringify(oracleJSON);

            const userJSONstring = JSON.stringify(userSignedJSON);

            if (oracleJSONstring === userJSONstring) {

                try {
                    const oraclePK = await utilCredentials.getOracleCredentials(channelInfo[0]);

                    const signatureOracle = sigUtil.personalSign(ethUtil.toBuffer(oraclePK), { data: oracleJSONstring.toLowerCase() });

                    let paymentJson = {
                        addressa: oracleJSON.addressa,
                        balancea: oracleJSON.balancea,
                        addressb: oracleJSON.addressb,
                        balanceb: oracleJSON.balanceb,
                        prevstate: oracleJSON.prevstate,
                        signature: signature,
                        oraclesignature: signatureOracle
                    };

                    const ipfsHash = await ipfs.add(new Buffer.from(JSON.stringify(paymentJson)));

                    const resultPublishIPNS = await utilIpfs.publishIPNS(ipfsHash[0].path, channelInfo[1]);
                    logger.trace(`/checkAndSendPayment func - resultPublishIPNS / utilIpfs.publishIPNS(): ${JSON.stringify(resultPublishIPNS)}`);
                    res.json(true);

                } catch (error) {
                    logger.error(`/checkAndSendPayment func with req.body: ${JSON.stringify(req.body)} - error: ${error}`)
                    return res.status(400).end(error);
                }

            } else {
                logger.error(`/checkAndSendPayment func with req.body: ${JSON.stringify(req.body)} - error: Proposed JSON and last JSON are not equal.`);
                return res.status(400).send('ERROR: Proposed JSON and last JSON are not equal.');
            }
        } else {
            logger.error(`/checkAndSendPayment func with req.body: ${JSON.stringify(req.body)} - error: Is not part of the payment channel.`);
            return res.status(400).send('ERROR: Is not part of the payment channel.');
        }
    } catch (error) {
        logger.error(`/checkAndSendPayment func with req.body: ${JSON.stringify(req.body)} - error: ${error}`);
        return res.status(400).end();
    }
});

router.post('/close', async (req, res) => {

    logger.debug(`Entering /close func with req.body: ${JSON.stringify(req.body)}`);

    let channelId = req.body.channelId;
    let signature = req.body.sig;
    const sigData = 'close payment channel';

    try {
        const channel = await helper.artifactsToContract(helper.getWeb3WS(rpcUrlws), scaasscBuild);

        const channelInstance = await channel.deployed()

        const channelInfo = await channelInstance.getChannelInfo.call(channelId);

        const oracleAddress = channelInfo[0].toLowerCase();
        console.log('oracle addr:', oracleAddress)

        const oraclePK = await utilCredentials.getOracleCredentials(oracleAddress);

        if (channelInfo[6].toNumber() != 1) {
            logger.error(`/checkAndSendPayment func with req.body: ${JSON.stringify(req.body)} - error: Channel is not in the right state.`);
            return res.status(400).send('ERROR: Channel is not in the right state.');
        }
        const ipnsId = channelInfo[1];

        const result = await ipfs.name.resolve(ipnsId);
        logger.trace(`/close func - result / ipfs.name.resolve(): ${result}`);

        const ipfsFile = await ipfs.get(result.substring(6));
        logger.trace(`/close func - ipfsFile /  ipfs.get(): ${ipfsFile}`);

        const ipfsJSON = JSON.parse(ipfsFile[0].content.toString().toLowerCase());
        logger.trace(`/close func - ipfsJSON: ${JSON.stringify(ipfsJSON)}`);

        const sender = sigUtil.recoverPersonalSignature({ data: sigData, sig: signature }).toLowerCase();
        logger.trace(`/close func - sender / sigUtil.recoverPersonalSignature(): ${sender}`);

        const lastPaymentJSON = {
            addressa: ipfsJSON.addressa,
            balancea: ipfsJSON.balancea,
            addressb: ipfsJSON.addressb,
            balanceb: ipfsJSON.balanceb,
            prevstate: ipfsJSON.prevstate
        };

        logger.trace(`/close func - lastPaymentJSON: ${JSON.stringify(lastPaymentJSON)}`);

        const lastUserSignature = ipfsJSON.signature;
        const lastOracleSignature = ipfsJSON.oraclesignature;


        if (ipfsJSON.addressa === sender || ipfsJSON.addressb === sender) {
            const resultRedis = await utilRedis.getKeyValueDB(ipnsId);
            logger.trace(`/close func - resultRedis / utilRedis.getKeyValueDB(): ${resultRedis}`);
            if (resultRedis === 'false') {
                const result = await utilRedis.setKeyValueDB(ipnsId, true);
                logger.trace(`Oracle will close the channel.`);

                const provider = new HDWalletProvider(oraclePK, rpcUrl);

                const channel = await helper.artifactsToContract(new Web3(provider), scaasscBuild);

                const channelInstance = await channel.deployed()

                try {
                    await channelInstance.closeChannel(
                        channelId,
                        ipfsJSON.balancea,
                        ipfsJSON.balanceb,
                        JSON.stringify(lastPaymentJSON).toLowerCase(),
                        lastOracleSignature,
                        lastUserSignature,
                        {
                            from: oracleAddress,
                            gasPrice: gasPrice
                        }
                    );
                    await utilRedis.setKeyValueDB(ipnsId, false);
                    logger.debug(`/close func - Oracle successfully closed the channel.`);
                    await utilCredentials.setFreeOracle(oracleAddress);
                    res.json(true);
                } catch (error) {
                    await utilRedis.setKeyValueDB(ipnsId, false);
                    logger.error(`/close func with req.body: ${JSON.stringify(req.body)} - error: Oracle unsuccessfully closed the channel.`);
                    logger.error(`/close func with req.body: ${JSON.stringify(req.body)} - error: ${error}`);
                    return res.status(400).send('ERROR: Oracle unsuccessfully closed the channel.');
                }
            } else {
                logger.error(`/close func with req.body: ${JSON.stringify(req.body)} - error: Oracle can't close the channel because the microtransaction is in the proggress.`);
                return res.status(400).send("ERROR: Oracle can't close the channel because the microtransaction is in the proggress.");
            }
        } else {
            logger.error(`/close func with req.body: ${JSON.stringify(req.body)} - error: Is not part of the payment channel.`);
            return res.status(400).send('ERROR: Is not part of the payment channel');
        }

    } catch (error) {
        logger.error(`/close func with req.body: ${JSON.stringify(req.body)} - error: ${error}`);
        return res.status(400).end();
    }
});

module.exports = router;