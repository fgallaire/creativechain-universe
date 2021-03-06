
let fileStorage = FileStorage.load(Constants.APP_CONF_FILE);
let walletPassword;
let walletLocked = false;
let downloading = false;
let initialized = false;
let syncProcess;
let syncProcessHandled = false;
let coreLoaded = -1;
let showingWindowsNotif = false;
let windowsNotifTimeout = null;
let platformLoaded = false;

$(document).ready(function () {
    console.log('Document ready');
    enablePasswordInput(false);
    let leftArrow = $('#slide-left-arrow');
    let rightArrow = $('#slide-right-arrow');


    leftArrow.click(function (event) {
        let slide = $('.item.active').attr('id');
        slide = slide.replace('slide-', '');
        console.log('to left', slide);
        slide = parseInt(slide);
        if (slide === 1) {
            return false;
        }
    });

    rightArrow.click(function (event) {
        let slide = $('.item.active').attr('id');
        slide = slide.replace('slide-', '');
        console.log('to right', slide, coreLoaded);
        slide = parseInt(slide);
        if (coreLoaded === -1 && slide === 5) {
            coreLoaded = 0;
            modal.loading(lang.CreatingWallet)
        } else if ((coreLoaded === 0 || !walletLocked) && slide === 6){
            return false
        } else if (slide === 9) {
            return false;
        }
    });

    $(document).keydown(function (event) {
        let element;
        //console.log(event.which);
        switch (event.which) {
            case 37: //left arrow
                element = leftArrow;
                break;
            case 39: //right arrow
                element = rightArrow;
                break;
            default:
                return;
        }

        element.click();
        event.preventDefault();
        return false;

    })
});

trantor.events.on('onDaemonDownload', function (progress) {
    onSplash = true;
    if (!downloading) {
        setTask(lang.DownloadingResources);
        downloading = true;
    }

    $('#progress-bar').attr('value', progress);

    console.log('Downloading daemon', progress);
    if (progress >= 100) {
        startSynchronization();
        enablePasswordInput(true);
    }

});

trantor.events.on('onStart', function () {
    console.log('Trantor initialized!');
    fileClient.close();
    startSynchronization();

    setTimeout(function () {
        checkWalletEncryption();
    }, 1000);

    if (!syncProcessHandled) {
        handleSyncProgress();
    }

});

trantor.events.on('onNotification', function (title, body, icon, duration) {

    if (OS.isWindows8Or10()) {
        showWinNotif(body, duration)
    } else {
        Notifications.notify(title, body, icon, duration);
    }

});

function showWinNotif(body, duration) {
    let winNotif = $('#win-notification');
    let winNotifText = $('#win-notification-text');
    let winNotifClose = $('#win-notification-close');

    let closeNotif = function () {
        winNotif.removeClass('efect-alert-footer');
        showingWindowsNotif = false;
    };

    if (showingWindowsNotif) {
        if (windowsNotifTimeout) {
            clearTimeout(windowsNotifTimeout);
        }
    }

    winNotifText.html(body);
    winNotifClose.unbind('click')
        .click(function () {
            closeNotif();
        });

    if (duration) {
        duration = duration * 1000;
        windowsNotifTimeout = setTimeout(function () {
            closeNotif();
        }, duration)
    }

    if (!showingWindowsNotif) {
        winNotif.addClass('efect-alert-footer');
        showingWindowsNotif = true;
    }
}

trantor.events.on('onLog', function () {
    console.log.apply(console, arguments);
});

function checkWalletEncryption(stop = 0) {
    //Checking if wallet.dat is encrypted
    trantor.client.help(function (err, result) {
        if (err) {
            console.error(err);
            setTimeout(function () {
                checkWalletEncryption(++stop);
            }, 2000);
        } else {
            //console.log(result);
            modal.hide();
            if (result.indexOf('walletlock') >= 0 ) {
                walletLocked = true;
                if (!syncProcessHandled) {
                    handleSyncProgress();
                }
            }

            enablePasswordInput(!walletLocked)
        }
    })
}

function startSynchronization() {
    if (!initialized) {
        setTask(lang.Synchronizing);
        handleSyncProgress();
        initialized = true;
    }

    setTimeout(function () {
        getUserAddress(function (userAddress) {
            $('#user-address').html(userAddress);
        });
    }, 3000);
}


function handleSyncProgress() {

    let onSync = function () {
        syncProcessHandled = true;
        trantor.client.getBlockchainInfo(function (err, result) {
            if (err) {
                console.error(err);
                if (err.code === 'ECONNREFUSED') {
                    //startTrantor();
                }
            } else {

                coreLoaded = 1;
                checkWalletEncryption();
                //console.log(result);
                console.log('Blockchain sync', result.blocks + ' / ' + result.headers);
                setTask(lang.Synchronizing);
                setProgress(result.blocks, result.headers);

                if (parseInt(result.blocks) >= parseInt(result.headers)) {
                    clearInterval(syncProcess);
                }
            }
        });
    };


    syncProcess = setInterval(function () {
        onSync();
    }, 1000);
}

function setProgress(progress, max = 0) {

    if (max) {
        $('#progress-bar').attr('max', max);
    }

    if (progress) {
        $('#progress-bar').attr('value', progress);

        if (progress >= max) {
            $('#progress-text').html(lang.Completed);

            $('#start-button').removeAttr('disabled');
        }
    }


}

function setTask(progressText) {

    $('#progress-bar').attr('value', 0);

    $('#progress-text').html(progressText);
}

function enablePasswordInput(enable = false) {
    console.log('Enabling', enable);
    $('#wallet-password').prop('disabled', !enable);
    $('#wallet-repeat-password').prop('disabled',! enable);
    if (enable) {
        $('#wallet-encrypt').removeClass('hidden');
        $('#wallet-encrypted').addClass('hidden');
    } else {
        $('#wallet-encrypt').addClass('hidden');
        $('#wallet-encrypted').removeClass('hidden');
    }

}

function encryptWallet() {

    let password = $('#wallet-password').val();
    let repeatPassword = $('#wallet-repeat-password').val();

    if (walletLocked) {
        modal.alert({
            message: lang.WalletEncrypted
        });
    } else {
        console.log(password, repeatPassword);
        if (password.length > 0 && repeatPassword.length > 0 && password === repeatPassword) {
            setTask(lang.EncryptingWallet);
            modal.loading();

            enablePasswordInput(false);
            walletPassword = password;
            trantor.encryptWallet(password, function (err, result) {
                if (err) {
                    modal.error({
                        message: err.message
                    });

                    walletPassword = false;
                    setTask(err.message)
                } else {
                    walletPassword = password;
                    console.log('Wallet encrypted!', result);
                    trantor.events.emit('onNotification', lang.Wallet, lang.WalletEncrypted, './assets/img/notification/wallet.png', 3);
                    trantor.stop(false);
                    syncProcessHandled = false;
                    setTimeout(function () {
                        startTrantor();
                    }, 1000 * 7);
                }
            })
        } else {
            modal.alert({
                message: lang['PasswordsNotMatch']
            });
        }
    }
}

function initPlatform() {
    if (walletLocked) {
        fileStorage.setKey('firstUseExecuted', true);

        trantor.stop(false);
        modal.loading(lang.PleaseWait);
        setTimeout(function () {
            window.location.href = 'platform.html';
        }, 7000);
    } else{
        modal.alert({
            message: lang.EncryptWalletAlert
        });
    }
}

function createBackup() {
    let dialog = control.dialog;

    let isTestnet = Constants.DEBUG;
    let walletPath = Constants.BIN_FOLDER + (isTestnet ? 'testnet3' + Constants.FILE_SEPARATOR : '') + 'wallet.dat';
    let name = File.getName(walletPath);
    let title = String.format(lang.SaveFile, name);
    dialog.showSaveDialog(null, {
        title: title,
        defaultPath: name
    }, function (fileName) {
        if (fileName) {
            trantor.stop(false);
            //coreLoaded = -1;
            modal.loading();

            let timeout = 3000;
            if (!OS.isLinux()) {
                timeout = 10000;
            }
            setTimeout(function () {
                File.cp(walletPath, fileName);
                modal.hide();

                trantor.initClients(function () {
                    checkWalletEncryption(0)
                });
                let notifBody = String.format(lang.FileCopied, fileName);
                trantor.events.emit('onNotification', lang.Files, notifBody, './assets/img/notification/wallet.png', 10);
            }, timeout)
        }
    })
}

function loadWalletFile() {
    dialog.showOpenDialog((fileNames) => {
        if(fileNames){
            let walletFile = fileNames[0];
            $('#wallet-file').val(walletFile);

            let destFile = Constants.WALLET_FOLDER + 'wallet.dat';

            trantor.client.stop();
            //coreLoaded = -1;
            modal.loading();
            let timeout = 3000;
            if (!OS.isLinux()) {
                timeout = 10000;
            }

            setTimeout(function () {
                File.mkpath(destFile, true);
                File.cp(walletFile, destFile);

                modal.hide();
                trantor.initClients(function () {
                    checkWalletEncryption(0)
                });
                modal.alert({
                    message: String.format(lang.FileLoadedCorrectly, walletFile)
                })
            }, timeout)

        } else {
            console.log("No file selected");
        }
    })
}

/*
function loadWalletFile() {
    dialog.showOpenDialog({
        title: lang.SelectUserFile,
        filters: [
            {name: 'Creativechain User File', extensions: ['crea']}
        ]
        }, function (fileNames) {
            if(fileNames){
                let userFile = fileNames[0];
                $('#wallet-file').val(userFile);

                let fileBuffer = File.read(userFile, null);
                let data = decodeUserData(fileBuffer);

                trantor.stop();
                File.cp(Constants.WALLET_FILE, Constants.WALLET_FILE + '.backup');
                File.write(Constants.WALLET_FILE, data.wallet.toString());
                File.write(Constants.DATABASE_FILE, data.index.toString());
                trantor.start();
            } else {
                console.log("No file selected");
            }

        }

    )
}*/
