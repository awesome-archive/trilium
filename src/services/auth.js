"use strict";

const sql = require('./sql');
const log = require('./log');
const sqlInit = require('./sql_init');
const utils = require('./utils');
const passwordEncryptionService = require('./password_encryption');
const optionService = require('./options');

function checkAuth(req, res, next) {
    if (!sqlInit.isDbInitialized()) {
        res.redirect("setup");
    }
    else if (!req.session.loggedIn && !utils.isElectron()) {
        res.redirect("login");
    }
    else {
        next();
    }
}

// for electron things which need network stuff
// currently we're doing that for file upload because handling form data seems to be difficult
function checkApiAuthOrElectron(req, res, next) {
    if (!req.session.loggedIn && !utils.isElectron()) {
        reject(req, res, "Not authorized");
    }
    else {
        next();
    }
}

function checkApiAuth(req, res, next) {
    if (!req.session.loggedIn) {
        reject(req, res, "Not authorized");
    }
    else {
        next();
    }
}

function checkAppInitialized(req, res, next) {
    if (!sqlInit.isDbInitialized()) {
        res.redirect("setup");
    }
    else {
        next();
    }
}

function checkAppNotInitialized(req, res, next) {
    if (sqlInit.isDbInitialized()) {
        reject(req, res, "App already initialized.");
    }
    else {
        next();
    }
}

function checkToken(req, res, next) {
    const token = req.headers.authorization;

    if (sql.getValue("SELECT COUNT(*) FROM api_tokens WHERE isDeleted = 0 AND token = ?", [token]) === 0) {
        reject(req, res, "Not authorized");
    }
    else {
        next();
    }
}

function reject(req, res, message) {
    log.info(`${req.method} ${req.path} rejected with 401 ${message}`);

    res.status(401).send(message);
}

function checkBasicAuth(req, res, next) {
    const header = req.headers.authorization || '';
    const token = header.split(/\s+/).pop() || '';
    const auth = new Buffer.from(token, 'base64').toString();
    const [username, password] = auth.split(/:/);

    const dbUsername = optionService.getOption('username');

    if (dbUsername !== username || !passwordEncryptionService.verifyPassword(password)) {
        res.status(401).send('Incorrect username and/or password');
    }
    else {
        next();
    }
}

module.exports = {
    checkAuth,
    checkApiAuth,
    checkAppInitialized,
    checkAppNotInitialized,
    checkApiAuthOrElectron,
    checkToken,
    checkBasicAuth
};
