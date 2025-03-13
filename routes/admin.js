const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const config = require('../config/config');
const bartolini = require('../services/bartolini');
const woocommerce = require('../services/woocommerce');

// Middleware di autenticazione base (da migliorare in produzione)
const authMiddleware = (req, res, next) => {
    if (!req.session.isAdmin) {
        return res.redirect('/admin/login');
    }
    next();
};

// Login page
router.get('/login', (req, res) => {
    res.render('admin/login', {
        title: 'Admin Login',
        error: null
    });
});

// Login process (semplificato - da migliorare in produzione)
router.post('/login', (req, res) => {
    const { username, password } = req.body;
    if (username === 'admin' && password === 'admin') {
        req.session.isAdmin = true;
        res.redirect('/admin/dashboard');
    } else {
        res.render('admin/login', {
            title: 'Admin Login',
            error: 'Credenziali non valide'
        });
    }
});

// Dashboard
router.get('/dashboard', authMiddleware, async (req, res) => {
    try {
        const returns = JSON.parse(fs.readFileSync(config.dataPath, 'utf8'));
        res.render('admin/dashboard', {
            title: 'Dashboard Admin',
            returns: returns.reverse()
        });
    } catch (error) {
        console.error('Errore nel caricamento dei resi:', error);
        res.status(500).json({ success: false, message: 'Errore nel caricamento dei resi' });
    }
});

// Approva reso
router.post('/approve/:id', authMiddleware, async (req, res) => {
    try {
        const returnId = parseInt(req.params.id);
        console.log('Processing return approval for ID:', returnId);

        // Leggi il file dei resi
        const returns = JSON.parse(fs.readFileSync(config.dataPath, 'utf8'));
        const returnRequest = returns.find(r => r.id === returnId);

        if (!returnRequest) {
            console.error('Return request not found:', returnId);
            return res.status(404).json({ success: false, message: 'Richiesta di reso non trovata' });
        }

        // Recupera i dati dell'ordine da WooCommerce
        const order = await woocommerce.getOrder(returnRequest.orderId);
        console.log('WooCommerce order data:', order);

        // Prepara i dati per la spedizione
        const shipmentData = {
            orderId: returnRequest.orderId,
            firstName: order.shipping.first_name,
            lastName: order.shipping.last_name,
            company: order.shipping.company || '',
            address: order.shipping.address_1,
            city: order.shipping.city,
            postcode: order.shipping.postcode,
            email: order.billing.email,
            phone: order.billing.phone || '',
            isReturn: true // Indica che è un reso
        };

        console.log('Dati spedizione:', shipmentData);

        // Chiamata API Bartolini per generare l'etichetta
        const labelResult = await bartolini.generateLabel(shipmentData);
        console.log('Label generated successfully:', labelResult);

        // Aggiorna lo stato del reso
        returnRequest.status = 'approved';
        returnRequest.labelPath = labelResult.pdfPath;
        returnRequest.trackingNumber = labelResult.trackingNumber;
        returnRequest.approvedAt = new Date();
        returnRequest.shippingData = shipmentData;

        // Salva le modifiche
        fs.writeFileSync(config.dataPath, JSON.stringify(returns, null, 2));
        console.log('Return request updated successfully');

        res.json({ 
            success: true, 
            message: 'Reso approvato con successo',
            labelUrl: `/admin/label/${returnId}`
        });
    } catch (error) {
        console.error('Error in return approval:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Errore nell\'approvazione del reso: ' + (error.message || 'Errore sconosciuto')
        });
    }
});

// Rifiuta reso
router.post('/reject/:id', authMiddleware, (req, res) => {
    try {
        const returnId = parseInt(req.params.id);
        const returns = JSON.parse(fs.readFileSync(config.dataPath, 'utf8'));
        const returnIndex = returns.findIndex(r => r.id === returnId);

        if (returnIndex === -1) {
            return res.status(404).json({ success: false, message: 'Richiesta di reso non trovata' });
        }

        returns[returnIndex].status = 'rejected';
        returns[returnIndex].rejectedAt = new Date();

        fs.writeFileSync(config.dataPath, JSON.stringify(returns, null, 2));

        res.json({ success: true, message: 'Reso rifiutato con successo' });
    } catch (error) {
        console.error('Error in return rejection:', error);
        res.status(500).json({ success: false, message: 'Errore nel rifiuto del reso' });
    }
});

// Download etichetta
router.get('/label/:id', authMiddleware, async (req, res) => {
    try {
        const returnId = parseInt(req.params.id);
        const returns = JSON.parse(fs.readFileSync(config.dataPath, 'utf8'));
        const returnRequest = returns.find(r => r.id === returnId);

        if (!returnRequest) {
            throw new Error('Richiesta di reso non trovata');
        }

        // Recupera i dati dell'ordine da WooCommerce
        const order = await woocommerce.getOrder(returnRequest.orderId);
        console.log('Recuperati dati ordine per etichetta:', returnRequest.orderId);

        // Prepara i dati per la spedizione
        const shipmentData = {
            orderId: returnRequest.orderId,
            firstName: order.shipping.first_name,
            lastName: order.shipping.last_name,
            company: order.shipping.company || '',
            address: order.shipping.address_1,
            city: order.shipping.city,
            postcode: order.shipping.postcode,
            email: order.billing.email,
            phone: order.billing.phone || '',
            isReturn: true // Indica che è un reso
        };

        // Genera una nuova etichetta
        console.log('Richiedo etichetta a Bartolini per ordine:', returnRequest.orderId);
        const labelResult = await bartolini.generateLabel(shipmentData);

        // Imposta gli headers per il download del PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="etichetta_${returnRequest.orderId}.pdf"`);
        
        // Invia il PDF come stream
        const pdfBuffer = fs.readFileSync(labelResult.pdfPath);
        res.send(pdfBuffer);

    } catch (error) {
        console.error('Errore nel download dell\'etichetta:', error);
        res.status(500).send('Errore nel download dell\'etichetta: ' + error.message);
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/admin/login');
});

module.exports = router; 