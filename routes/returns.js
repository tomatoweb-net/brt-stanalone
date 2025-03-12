const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const woocommerce = require('../services/woocommerce');

// Mostra form richiesta reso
router.get('/', (req, res) => {
    res.render('returns/form', {
        title: 'Richiedi Reso',
        error: null
    });
});

// Verifica ordine e mostra prodotti
router.post('/verify', async (req, res) => {
    try {
        const { orderId, email } = req.body;
        const isValid = await woocommerce.verifyOrderEmail(orderId, email);

        if (!isValid) {
            return res.render('returns/form', {
                title: 'Richiedi Reso',
                error: 'Ordine non trovato o email non corrispondente'
            });
        }

        const items = await woocommerce.getOrderItems(orderId);
        
        res.render('returns/products', {
            title: 'Seleziona Prodotti',
            orderId,
            items
        });
    } catch (error) {
        res.render('returns/form', {
            title: 'Richiedi Reso',
            error: error.message
        });
    }
});

// Salva richiesta reso
router.post('/submit', async (req, res) => {
    try {
        const { orderId, products } = req.body;
        const order = await woocommerce.getOrder(orderId);
        
        const returnRequest = {
            id: Date.now(),
            orderId,
            date: new Date(),
            status: 'pending',
            customer: {
                name: order.billing.first_name + ' ' + order.billing.last_name,
                email: order.billing.email,
                address: order.billing.address_1,
                city: order.billing.city,
                postcode: order.billing.postcode
            },
            products: Array.isArray(products) ? products : [products]
        };

        // Leggi file JSON esistente
        const returns = JSON.parse(fs.readFileSync(config.dataPath, 'utf8'));
        returns.push(returnRequest);
        fs.writeFileSync(config.dataPath, JSON.stringify(returns, null, 2));

        res.render('returns/success', {
            title: 'Reso Richiesto',
            returnId: returnRequest.id
        });
    } catch (error) {
        res.render('returns/form', {
            title: 'Richiedi Reso',
            error: error.message
        });
    }
});

module.exports = router; 