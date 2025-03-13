const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const bartolini = require('../services/bartolini');
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
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.per_page) || 10;

        // Recupera TUTTI gli ordini da WooCommerce
        const wooOrders = await woocommerce.getOrders({ 
            status: ['processing', 'on-hold', 'completed'],
            per_page: 100,  // Massimo numero di ordini per richiesta
            page: 1
        });
        
        console.log('Ordini WooCommerce ricevuti:', wooOrders.length);

        // Recupera le spedizioni già create
        const shipmentsFile = path.join(process.cwd(), 'data', 'shipments.json');
        let shipments = [];
        try {
            const data = await fs.promises.readFile(shipmentsFile, 'utf8');
            shipments = JSON.parse(data);
        } catch (error) {
            // Se il file non esiste, usa array vuoto
        }
        const shippedOrderIds = shipments.map(s => s.orderId);

        // Formatta gli ordini per la visualizzazione
        const allOrders = wooOrders.map(order => {
            const isShipped = shippedOrderIds.includes(order.id.toString());
            const shipment = isShipped ? shipments.find(s => s.orderId === order.id.toString()) : null;
            
            return {
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
                payment_method: order.payment_method_title,
                isShipped: isShipped,
                trackingNumber: shipment?.trackingNumber || null
            };
        });

        // Calcola gli indici per la paginazione
        const startIndex = (page - 1) * perPage;
        const endIndex = startIndex + perPage;
        const paginatedOrders = allOrders.slice(startIndex, endIndex);

        res.render('shipping/orders', {
            title: 'Gestione Spedizioni',
            orders: paginatedOrders,
            shipments: shipments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(allOrders.length / perPage),
                perPage: perPage,
                totalOrders: allOrders.length
            }
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
            email: order.billing.email,
            phone: order.billing.phone || ''
        };

        console.log('Dati spedizione:', shipmentData);

        // Crea la spedizione BRT
        console.log('📦 Creazione spedizione BRT per ordine:', orderId);
        const result = await bartolini.generateLabel(shipmentData);
        
        // Se arriviamo qui, la spedizione è stata creata e l'etichetta salvata
        console.log('✅ Spedizione creata con successo:', result.trackingNumber);
        
        // Salva i dati della spedizione
        const shipmentsFile = path.join(process.cwd(), 'data', 'shipments.json');
        let shipments = [];
        try {
            const data = await fs.promises.readFile(shipmentsFile, 'utf8');
            shipments = JSON.parse(data);
        } catch (error) {
            // Se il file non esiste, usa array vuoto
        }

        shipments.push({
            success: true,
            orderId: orderId,
            trackingNumber: result.trackingNumber,
            labelPath: result.pdfPath,
            ...shipmentData,
            createdAt: new Date().toISOString(),
            status: 'created'
        });

        await fs.promises.writeFile(shipmentsFile, JSON.stringify(shipments, null, 2));
        
        try {
            // Prova ad aggiornare WooCommerce
            console.log('🔄 Aggiornamento stato ordine su WooCommerce...');
            await woocommerce.updateOrder(orderId, {
                status: 'completed',
                meta_data: [
                    { key: 'tracking_number', value: result.trackingNumber }
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
            trackingNumber: result.trackingNumber
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
        
        const shipmentsFile = path.join(process.cwd(), 'data', 'shipments.json');
        let shipments = [];
        try {
            const data = await fs.promises.readFile(shipmentsFile, 'utf8');
            shipments = JSON.parse(data);
        } catch (error) {
            throw new Error('Nessuna spedizione trovata');
        }

        const shipment = shipments.find(s => s.orderId === orderId);
        if (!shipment || !shipment.labelPath) {
            console.error('❌ Etichetta non trovata per ordine:', orderId);
            throw new Error('Etichetta non trovata');
        }

        // Verifica che il file esista
        const pdfPath = path.join(process.cwd(), config.pdfPath, path.basename(shipment.labelPath));
        if (!fs.existsSync(pdfPath)) {
            console.error(`❌ File etichetta non trovato: ${pdfPath}`);
            throw new Error('File etichetta non trovato');
        }

        // Leggi il file PDF
        const pdfData = fs.readFileSync(pdfPath);
        console.log(`✅ Invio etichetta: ${pdfPath}`);
        
        // Invia il file PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="label_${orderId}.pdf"`);
        res.end(pdfData);

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

// Rotta per la creazione massiva di spedizioni
router.post('/mass-create', async (req, res) => {
    try {
        const { orderIds } = req.body;
        
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ 
                success: false, 
                error: 'Nessun ordine selezionato' 
            });
        }

        const results = [];
        const errors = [];

        // Processa gli ordini in serie per evitare sovraccarichi
        for (const orderId of orderIds) {
            try {
                const orderData = await woocommerce.getOrder(orderId);
                const result = await bartolini.generateLabel(orderData);
                
                if (result.success) {
                    // Aggiorna l'ordine su WooCommerce con il tracking
                    await woocommerce.updateOrder(orderId, {
                        status: 'completed',
                        meta_data: [
                            {
                                key: '_tracking_number',
                                value: result.trackingNumber
                            }
                        ]
                    });
                    
                    results.push({
                        orderId,
                        success: true,
                        trackingNumber: result.trackingNumber
                    });
                }
            } catch (error) {
                console.error(`Errore per ordine ${orderId}:`, error);
                errors.push({
                    orderId,
                    error: error.message
                });
            }
        }

        res.json({
            success: true,
            results,
            errors,
            message: `Processati ${results.length} ordini con successo, ${errors.length} errori`
        });

    } catch (error) {
        console.error('Errore nella creazione massiva:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Rotta per la lista stampabile delle spedizioni
router.get('/print-list', async (req, res) => {
    try {
        const dateFilter = req.query.dateFilter || 'today';
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        let startDate, endDate;
        
        if (dateFilter === 'today') {
            startDate = today;
            endDate = new Date(today);
            endDate.setHours(23, 59, 59, 999);
        } else {
            startDate = new Date(req.query.startDate || today);
            endDate = new Date(req.query.endDate || today);
            startDate.setHours(0, 0, 0, 0);
            endDate.setHours(23, 59, 59, 999);
        }

        // Recupera tutti gli ordini spediti
        const orders = await woocommerce.getOrders({
            status: ['completed'],
            per_page: 100
        });

        // Formatta i dati per la stampa
        const shipments = orders.map(order => {
            const shipping = order.shipping;
            const trackingNumber = order.meta_data.find(meta => meta.key === 'tracking_number')?.value;
            const orderDate = new Date(order.date_created);
            
            if (!trackingNumber) return null;

            return {
                date: order.date_created,
                trackingNumber: trackingNumber,
                orderNumber: order.number,
                customerName: `${shipping.first_name} ${shipping.last_name}`,
                address: `${shipping.address_1}, ${shipping.postcode} ${shipping.city}`
            };
        })
        .filter(shipment => {
            if (!shipment) return false;
            const shipmentDate = new Date(shipment.date);
            return shipmentDate >= startDate && shipmentDate <= endDate;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));

        res.render('shipping/print-list', { 
            shipments,
            dateFilter,
            startDate: startDate.toISOString().split('T')[0],
            endDate: endDate.toISOString().split('T')[0]
        });
    } catch (error) {
        console.error('Errore nel recupero delle spedizioni:', error);
        res.status(500).send('Errore nel recupero delle spedizioni');
    }
});

module.exports = router; 