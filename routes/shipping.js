const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const shippingService = require('../services/shipping');
const woocommerce = require('../services/woocommerce');

// Middleware di autenticazione
const authMiddleware = (req, res, next) => {
    if (!req.session.isAdmin) {
        return res.redirect('/admin/login');
    }
    next();
};

// Lista ordini da spedire
router.get('/orders', authMiddleware, async (req, res) => {
    try {
        // Recupera gli ordini da WooCommerce
        const wooOrders = await woocommerce.getOrders({ 
            status: ['processing', 'on-hold'],
            per_page: 50
        });
        
        console.log('Ordini WooCommerce ricevuti:', wooOrders.length);

        // Recupera le spedizioni già create
        const shipments = await shippingService.getShipments();
        const shippedOrderIds = shipments.map(s => s.orderId);

        // Formatta gli ordini per la visualizzazione
        const orders = wooOrders
            .filter(order => !shippedOrderIds.includes(order.id.toString()))
            .map(order => ({
                orderId: order.id.toString(),
                firstName: order.shipping.first_name,
                lastName: order.shipping.last_name,
                company: order.shipping.company,
                address: order.shipping.address_1,
                city: order.shipping.city,
                province: order.shipping.state,
                postcode: order.shipping.postcode,
                email: order.billing.email,
                phone: order.billing.phone,
                date_created: order.date_created,
                status: order.status,
                total: order.total,
                payment_method: order.payment_method_title
            }));

        console.log('Ordini formattati:', orders);

        res.render('shipping/orders', {
            title: 'Gestione Spedizioni',
            orders: orders,
            shipments: shipments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        });
    } catch (error) {
        console.error('Error loading orders:', error);
        res.status(500).send('Errore nel caricamento degli ordini: ' + error.message);
    }
});

// Crea spedizione
router.post('/create/:orderId', authMiddleware, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        console.log('Creating shipment for order:', orderId);

        // Recupera i dati dell'ordine da WooCommerce
        const order = await woocommerce.getOrder(orderId);
        if (!order) {
            throw new Error('Ordine non trovato');
        }

        // Prepara i dati per la spedizione
        const shipmentData = {
            orderId: orderId,
            firstName: order.shipping.first_name,
            lastName: order.shipping.last_name,
            company: order.shipping.company || '',
            address: order.shipping.address_1,
            city: order.shipping.city,
            postcode: order.shipping.postcode,
            province: order.shipping.state || '',
            email: order.billing.email,
            phone: order.billing.phone || '',
            weight: parseFloat(order.shipping_lines?.[0]?.total || 1.0)
        };

        console.log('Dati spedizione:', shipmentData);

        // Crea la spedizione BRT
        console.log('📦 Creazione spedizione BRT per ordine:', orderId);
        const shipment = await shippingService.createBRTShipment(shipmentData);
        
        // Se arriviamo qui, la spedizione è stata creata e l'etichetta salvata
        console.log('✅ Spedizione creata con successo:', shipment.trackingNumber);
        
        try {
            // Prova ad aggiornare WooCommerce
            console.log('🔄 Aggiornamento stato ordine su WooCommerce...');
            await woocommerce.updateOrder(orderId, {
                status: 'completed',
                meta_data: [
                    { key: 'tracking_number', value: shipment.trackingNumber }
                ]
            });
            console.log('✅ Ordine aggiornato su WooCommerce');
        } catch (wooError) {
            // Se WooCommerce fallisce, logga l'errore ma non bloccare il processo
            console.error('⚠️ Errore aggiornamento WooCommerce:', wooError.message);
            // Continua comunque con la risposta
        }

        // Rispondi con successo anche se WooCommerce fallisce
        res.json({
            success: true,
            message: 'Spedizione creata con successo',
            shipment: shipment
        });

    } catch (error) {
        console.error('❌ Errore creazione spedizione:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

// Download etichetta
router.get('/label/:orderId', authMiddleware, async (req, res) => {
    try {
        const orderId = req.params.orderId;
        console.log('📄 Richiesta download etichetta per ordine:', orderId);
        
        const shipments = await shippingService.getShipments();
        const shipment = shipments.find(s => s.orderId === orderId);

        if (!shipment || !shipment.labelPath) {
            console.error('❌ Etichetta non trovata per ordine:', orderId);
            throw new Error('Etichetta non trovata');
        }

        console.log('✅ Invio etichetta:', shipment.labelPath);
        
        // Verifica che il file esista
        if (!fs.existsSync(shipment.labelPath)) {
            console.error('❌ File etichetta non trovato:', shipment.labelPath);
            throw new Error('File etichetta non trovato');
        }

        // Invia il file PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="label_${orderId}.pdf"`);
        fs.createReadStream(shipment.labelPath).pipe(res);

    } catch (error) {
        console.error('❌ Errore download etichetta:', error);
        res.status(404).send('Etichetta non trovata: ' + error.message);
    }
});

// Route per resettare gli ordini spediti (solo per testing)
router.post('/reset-orders', authMiddleware, async (req, res) => {
    try {
        console.log('🔄 Reset ordini spediti...');
        
        // 1. Recupera le spedizioni
        const shipments = await shippingService.getShipments();
        
        // 2. Per ogni spedizione, riporta l'ordine in "processing"
        for (const shipment of shipments) {
            try {
                console.log(`Resetting ordine ${shipment.orderId} a "processing"...`);
                await woocommerce.updateOrder(shipment.orderId, {
                    status: 'processing',
                    meta_data: [] // Rimuove il tracking number
                });
            } catch (error) {
                console.error(`Errore reset ordine ${shipment.orderId}:`, error.message);
                // Continua con il prossimo ordine
            }
        }
        
        // 3. Svuota il file delle spedizioni
        await fs.promises.writeFile(
            path.join(process.cwd(), 'data', 'shipments.json'), 
            '[]'
        );
        
        console.log('✅ Reset completato');
        
        res.json({
            success: true,
            message: 'Ordini resettati con successo'
        });
        
    } catch (error) {
        console.error('❌ Errore reset ordini:', error);
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
});

module.exports = router; 