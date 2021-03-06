let invited = false;
let inviting = false;
let startTimeout = null;

/**
 *
 * @returns {string}
 */
function getClipboardText() {
    return clipboard.readText();
}

function httpPostCall(url, params, callback) {
    getAccessToken(function (accessToken) {
        console.log(accessToken);
        http.post({
            url: url,
            headers: {
                Authorization: 'Bearer ' + accessToken
            },
            formData: params
        }, callback);
    });
}

function inviteUser(address) {

    if (!invited && !inviting && platformLoaded) {
        inviting = true;
        let credentials = FileStorage.load(Constants.CREDENTIALS_FILE);
        credentials = credentials.storage;

        let params = {
            wallet: address
        };

        let url = credentials.base_url + credentials.endpoints.ADD;

        httpPostCall(url, params, function (err, result, body) {
            console.log('INVITATION', err, result, body);
            inviting = false;

            let retry = function () {
                setTimeout(function () {
                    inviteUser(address);
                }, 60000);
            };

            if (!err && result.statusCode >= 200 && result.statusCode <= 299) {
                invited = true;
            } else {
                if (body) {
                    body = JSON.parse(body);

                    //If response is on of this errors, avoid to retry
                    if (body.message === 'TOO_REQUESTS' || body.message === 'INVALID_ADDRESS' || body.message === 'UNKNOWN_ERROR') {
                        invited = true;
                    }
                }

                if (!invited) {
                    retry();
                }

            }
        });
    }

}

/**
 *
 * @param {string} contentAddress
 * @param {string} content
 * @param callback
 */
function encryptContent(contentAddress, content, callback) {
    let credentials = FileStorage.load(Constants.CREDENTIALS_FILE);
    credentials = credentials.storage;

    let params = {
        address: contentAddress,
        content: content
    };

    let url = credentials.base_url + credentials.endpoints.SECRET_CONTENT;

    httpPostCall(url, params, function (err, response, body) {
        if (err) {
            console.error(err);
            callback();
        } else {
            console.log(body);
            callback(JSON.parse(body));
        }
    });
}

/**
 *
 * @param {string} contentAddress
 * @param {string} txId
 * @param {string} payment
 * @param callback
 */
function decryptContent(contentAddress, txId, payment, callback) {
    getUserAddress(function (userAddress) {
        console.log(contentAddress, userAddress, txId);
        trantor.client.signMessage(userAddress, txId, function (err, signature) {
            if (err) {
                console.error(err);
            } else {
                trantor.client.walletLock();
                let credentials = FileStorage.load(Constants.CREDENTIALS_FILE);
                credentials = credentials.storage;

                let params = {
                    content: contentAddress,
                    authoraddress: userAddress,
                    txid: txId,
                    signedtx: signature,
                    payment: payment
                };

                let url = credentials.base_url + credentials.endpoints.CHECK_CONTENT;
                console.log('Checking on ', url, params);
                httpPostCall(url, params, function (err, response, body) {
                    if (err) {
                        console.error(err);
                        callback();
                    } else {
                        let data = JSON.parse(body);
                        console.log(data);
                        callback(data.data.content);
                    }
                })
            }
        })
    })
}

function getAccessToken(callback) {
    let appConf = FileStorage.load(Constants.APP_CONF_FILE);
    let accessToken = appConf.getKey('accessToken');
    let time = appConf.getKey('accessTokenExpiration', 0);
    let now = new Date().getTime();

    let callCallback = function (token) {
        if (callback) {
            callback(token);
        }
    };

    if (accessToken && now < time) {
        callCallback(accessToken);
    } else {
        let credentials = FileStorage.load(Constants.CREDENTIALS_FILE);
        let params = {
            client_id: credentials.getKey('client_id'),
            client_secret: credentials.getKey('client_secret'),
            grant_type: 'client_credentials'
        };

        credentials = credentials.storage;

        let url = credentials.base_url + credentials.endpoints.CREDENTIALS;
        console.log(url, params);
        http.post({
            url: url,
            formData: params
        }, function (err, response, body) {
            if (err) {
                console.error(err)
            } else {
                console.log(body);
                let oauth = JSON.parse(body);
                let accessToken = oauth.access_token;
                let expiresIn = parseInt(oauth.expires_in) * 1000 + now;
                appConf.setKey('accessToken', accessToken);
                appConf.setKey('accessTokenExpiration', expiresIn);
                callCallback(accessToken);
            }

        })
    }
}

function getUserAddress(callback, retries = 0) {
    trantor.client.getAddressesByAccount('user', function (err, result) {
        if (err) {
            //console.error(err);
            if (retries < 5) {
                setTimeout(function () {
                    getUserAddress(callback, retries++);
                }, 100);
            }
        } else {

            let onNewAddress = function (addressCallback) {
                trantor.client.getAccountAddress('user', function (err, result) {
                    if (err) {
                        console.error(err);
                        if (retries < 5) {
                            setTimeout(function () {
                                getUserAddress(callback, retries++);
                            }, 100);
                        }
                    } else {
                        let address = result;
                        inviteUser(address);
                        if (addressCallback) {
                            addressCallback(address);
                        }
                    }
                })
            };


            if (result.length > 0) {
                if (callback) {
                    //console.log('user address', result[0]);

                    let valid = false;
                    for (let x = 0; x < result.length; x++) {
                        let address = result[0];
                        if (validateAddress(address)) {
                            valid = true;
                            inviteUser(address);
                            callback(address);
                            break;
                        }

                    }

                    if (!valid) {
                        onNewAddress(function (address) {
                            if (callback) {
                                callback(address);
                            }
                        })
                    }

                }
            } else {
                onNewAddress(function (address) {
                    if (callback) {
                        callback(address);
                    }
                })
            }
        }
    })

}

trantor.events.on('onInternetError', function () {
    modal.error({
        message: lang.InternetError
    })
});

function detectScrollBottom(event) {

    let scrollHeight = $(document).height();
    let scrollPosition = $(window).height() + $(window).scrollTop();
    if ((scrollHeight - scrollPosition) / scrollHeight === 0) {
        // when scroll to bottom of the page
        console.log('Scroll bottom detected!');
        loadMorePage();
    }
}

/**
 *
 * @param {string} walletFile
 * @param {string} indexFile
 * @param {number} version
 * @param callback
 */
function encodeUserData(walletFile, indexFile, version, callback) {
    let wallet, index;

    let compressIndex = function () {
        if (File.exist(indexFile)) {
            let compressed = File.read(indexFile, null);
            Utils.compress(compressed, 9, function (result, error) {
                index = {
                    data: result.toString('hex'),
                    size: result.length
                };

                let varint = require('varint');

                let data = ContentData.serializeNumber(version, 2);
                data += ContentData.serializeText(Buffer.from(wallet.data, 'hex').toString());
                data += ContentData.serializeText(Buffer.from(index.data, 'hex').toString());

                callback(Buffer.from(data, 'hex'));
            });

        } else {
            callback(false);
        }

    };

    if (File.exist(walletFile)) {
        let compressed = File.read(walletFile, null);
        Utils.compress(compressed, 9, function (result, error) {
            wallet = {
                data: result.toString('hex'),
                size: result.length
            };

            compressIndex();
        });

    } else {
        callback(false);
    }
}

/**
 *
 * @param {string/Buffer} data
 * @return {{version: (Number|number), wallet: Buffer, index: Buffer}}
 */
function decodeUserData(data) {

    if (typeof data === 'string') {
        data = Buffer.from(data, 'hex');
    }

    let offset = 0;
    let version = data.readUInt16BE(offset);
    offset += 2;

    let walletData = ContentData.deserializeText(data, offset);
    offset += walletData.offset2;
    console.log(walletData.offset, data.length);

    let indexData = ContentData.deserializeText(data, walletData.offset);


    return {
        version: version,
        wallet: Utils.decompress(Buffer.from(walletData.text)),
        index: Utils.decompress(Buffer.from(indexData.text))
    };
}

function handleRpcError(err, hideModal = false) {
    if (hideModal) {
        modal.hide();
    }

    let message = err.message;

    if (lang[err.code]) {
        message = lang[err.code];
    }

    modal.error({
        message: message
    });

    console.error(err);
}

function unlockW(pass, callback, lockTime = 10) {
    trantor.client.walletPassphrase(pass, lockTime, function (err, result) {
        callback(err, result);
    });
}
/**
 *
 * @param txHex
 * @param pass
 * @param callback
 * @param lockTime
 */
function sendTransaction(txHex, pass, callback, lockTime = 10) {

    unlockW(pass, function (err, result) {
        if (err) {
            callback(err, result);
        } else {
            trantor.client.sendRawTransaction(txHex, function (err, result) {
                if (err) {
                    callback(err, result)
                } else if (callback) {
                    callback(err, result);
                }

                trantor.client.walletLock();
            })
        }
    });

}

function startTrantor() {
    trantor.start(function () {

        let fileStorage = FileStorage.load(Constants.APP_CONF_FILE);
        let explore = fileStorage.getKey('firstUseExecuted', false);
        console.log('Trantor started! Explore', explore);

        if (explore) {
            trantor.explore();
            setInterval(function () {
                if (!trantor.isExploring) {
                    trantor.explore();
                }
            }, 10 * 1000);
        }
    });
}

trantor.events.on('onStart', function () {
    if (startTimeout) {
        clearTimeout(startTimeout)
    }

    let onGetTransactions = function () {
        trantor.client.listTransactions('user', 99999, function (err, result) {
            if (err) {
                if (err.code === -28) {
                    setTimeout(function () {
                        onGetTransactions();
                    }, 500);
                } else {
                    console.error(err);
                }
            } else if (result.length > 0) {
                let registerTx = result[0];
                console.log('Setting register time', registerTx.time);
                BUZZ.REGISTER_TIME = parseInt(registerTx.time);
            } else {
                console.error('Register time not found');
                BUZZ.REGISTER_TIME = 0;
            }
        })
    };

    onGetTransactions();
});

/**
 *
 * @param {string} address
 * @return {boolean}
 */
function validateAddress(address) {

    try {
        let hash = crealib.address.fromBase58Check(address).hash.toString('hex');
        return true;
    } catch (e) {
        //console.error('Invalid address', address, e);
        return false;
    }
}

startTrantor();
