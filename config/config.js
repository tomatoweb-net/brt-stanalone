require('dotenv').config();
const path = require('path');

const config = {
    dataPath: path.join(__dirname, '../data/returns.json'),
    shipmentsPath: path.join(__dirname, '../data/shipments.json'),
    pdfPath: path.join(__dirname, '../data/pdf'),
    bartolini: {
        apiUrl: 'https://api.brt.it/rest/v1/shipments',
        userId: process.env.BRT_USER_ID || 'test_user',
        password: process.env.BRT_PASSWORD || 'test_password'
    },
    woocommerce: {
        url: process.env.WC_URL || 'https://your-store.com',
        consumerKey: process.env.WC_KEY || 'your_key',
        consumerSecret: process.env.WC_SECRET || 'your_secret',
        version: 'wc/v3'
    },
    app: {
        port: process.env.PORT || 3000,
        dataFile: './data/returns.json',
        pdfDirectory: './public/pdf'
    }
};

module.exports = config; 