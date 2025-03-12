const axios = require('axios');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config();

class ShippingService {
    constructor() {
        // URL base per l'ambiente di test BRT
        this.baseUrl = 'https://api.brt.it/rest/v1';  // Modificato URL base
        this.apiUrl = `${this.baseUrl}/shipments/shipment`;  // Modificato URL completo
        
        this.credentials = {
            userId: process.env.BARTOLINI_USER_ID || '1020117',
            password: process.env.BARTOLINI_PASSWORD || 'brt5045txt'
        };
        
        // Configurazione axios con SSL e timeout
        this.axiosInstance = axios.create({
            httpsAgent: new https.Agent({
                rejectUnauthorized: false,
                keepAlive: true
            }),
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });

        console.log('🔧 Inizializzazione servizio spedizioni BRT con credenziali:', {
            userId: this.credentials.userId,
            apiUrl: this.apiUrl
        });
    }

    async getBRTShipment(senderReference) {
        try {
            console.log('🔍 Recupero dettagli spedizione esistente...');
            
            const requestData = {
                account: {
                    userID: this.credentials.userId,
                    password: this.credentials.password
                },
                senderReference: senderReference
            };

            const response = await this.axiosInstance.post(
                `${this.baseUrl}/find`,
                requestData
            );

            console.log('📥 Risposta ricerca spedizione:', JSON.stringify(response.data, null, 2));

            if (response.data.fault) {
                throw new Error(`Errore BRT: ${response.data.fault.faultstring}`);
            }

            const findResponse = response.data.findResponse;
            if (!findResponse || findResponse.executionMessage?.severity === 'ERROR') {
                throw new Error('Spedizione non trovata');
            }

            // Recupera l'etichetta
            console.log('🏷️ Recupero etichetta...');
            
            const labelResponse = await this.axiosInstance.post(
                `${this.baseUrl}/shipments/label`,
                {
                    account: {
                        userID: this.credentials.userId,
                        password: this.credentials.password
                    },
                    parcelID: findResponse.parcelID,
                    outputType: "PDF",
                    isBorderRequired: 1,
                    isLogoRequired: 1
                },
                {
                    responseType: 'stream',
                    headers: {
                        'Accept': 'application/pdf'
                    }
                }
            );

            console.log('📥 Risposta etichetta ricevuta');
            console.log('📥 Content-Type:', labelResponse.headers['content-type']);

            // Salva direttamente lo stream del PDF
            const filename = `label_${senderReference}.pdf`;
            const publicDir = path.join(process.cwd(), 'public');
            const labelsDir = path.join(publicDir, 'labels');
            
            // Assicurati che le directory esistano
            await fs.promises.mkdir(labelsDir, { recursive: true });
            
            const filePath = path.join(labelsDir, filename);
            console.log('💾 Salvo il PDF in:', filePath);

            // Crea write stream
            const writer = fs.createWriteStream(filePath);

            // Pipe la risposta direttamente nel file
            labelResponse.data.pipe(writer);

            // Attendi che il file sia salvato
            await new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log('✅ Stream PDF completato');
                    resolve();
                });
                writer.on('error', (err) => {
                    console.error('❌ Errore durante la scrittura:', err);
                    reject(err);
                });
                labelResponse.data.on('error', (err) => {
                    console.error('❌ Errore durante la lettura:', err);
                    reject(err);
                });
            });

            // Verifica che il file sia stato creato e non sia vuoto
            const stats = await fs.promises.stat(filePath);
            console.log('✅ PDF salvato con successo, dimensione:', stats.size, 'bytes');

            if (stats.size === 0) {
                throw new Error('Il file PDF salvato è vuoto');
            }

            return {
                trackingNumber: findResponse.parcelID,
                labelPath: filePath
            };

        } catch (error) {
            console.error('❌ Errore recupero spedizione:', error);
            if (error.response) {
                console.error('❌ Dettagli risposta:', {
                    status: error.response.status,
                    headers: error.response.headers,
                    data: error.response.data
                });
            }
            throw new Error(`Errore recupero spedizione: ${error.message}`);
        }
    }

    async createBRTShipment(orderData) {
        try {
            // Tronca l'indirizzo a 35 caratteri
            const address = orderData.address.substring(0, 35).toUpperCase();
            
            const requestData = {
                account: {
                    userID: this.credentials.userId,
                    password: this.credentials.password
                },
                createData: {
                    departureDepot: "102",
                    senderCustomerCode: this.credentials.userId,
                    deliveryFreightTypeCode: "DAP",
                    consigneeCompanyName: (orderData.company || `${orderData.firstName} ${orderData.lastName}`).substring(0, 35),
                    consigneeAddress: address,
                    consigneeZIPCode: orderData.postcode,
                    consigneeCity: orderData.city.toUpperCase(),
                    consigneeCountryAbbreviationISOAlpha2: "IT",
                    consigneeTelephone: orderData.phone?.replace(/[^0-9]/g, '') || '',
                    consigneeEMail: orderData.email,
                    numberOfParcels: 1,
                    weightKG: 1,
                    numericSenderReference: orderData.orderId,
                    isCODMandatory: 0,
                    cashOnDelivery: 0,
                    codCurrency: "EUR"
                },
                isLabelRequired: 1,
                labelParameters: {
                    outputType: "PDF",
                    isBorderRequired: 0,
                    isLogoRequired: 0
                }
            };

            console.log('📦 Invio richiesta a BRT...');
            console.log('📦 URL:', this.apiUrl);
            console.log('📦 Dati richiesta:', JSON.stringify(requestData, null, 2));
            
            // Prima creiamo la spedizione
            const shipmentResponse = await this.axiosInstance.post(this.apiUrl, requestData);
            console.log('📥 Risposta creazione spedizione:', JSON.stringify(shipmentResponse.data, null, 2));

            if (shipmentResponse.data.fault) {
                throw new Error(`Errore BRT: ${shipmentResponse.data.fault.faultstring}`);
            }

            const createResponse = shipmentResponse.data.createResponse;
            if (!createResponse) {
                throw new Error('Risposta BRT non valida');
            }

            // Verifica se c'è un errore nella risposta
            if (createResponse.executionMessage?.severity === 'ERROR') {
                throw new Error(`Errore BRT: ${createResponse.executionMessage.message}`);
            }

            // Usa parcelNumberFrom come tracking number
            const trackingNumber = createResponse.parcelNumberFrom;
            if (!trackingNumber) {
                console.error('❌ Dati mancanti nella risposta:', createResponse);
                throw new Error('Numero tracking non trovato nella risposta');
            }

            console.log('✅ Spedizione creata con tracking:', trackingNumber);

            // Ora richiediamo l'etichetta
            console.log('🏷️ Richiedo etichetta PDF per tracking:', trackingNumber);

            const labelRequestData = {
                account: {
                    userID: this.credentials.userId,
                    password: this.credentials.password
                },
                parcelID: trackingNumber,
                outputType: "PDF",
                isBorderRequired: 0,
                isLogoRequired: 0
            };

            console.log('📤 Richiesta etichetta:', JSON.stringify(labelRequestData, null, 2));

            const labelResponse = await this.axiosInstance.post(
                `${this.baseUrl}/shipments/label`,  // Modificato URL etichetta
                labelRequestData,
                {
                    responseType: 'stream',
                    headers: {
                        'Accept': 'application/pdf'
                    }
                }
            );

            console.log('📥 Risposta etichetta ricevuta');
            console.log('📥 Content-Type:', labelResponse.headers['content-type']);

            // Salva il PDF
            const filename = `label_${orderData.orderId}_${trackingNumber}.pdf`;
            const publicDir = path.join(process.cwd(), 'public');
            const labelsDir = path.join(publicDir, 'labels');
            
            // Assicurati che le directory esistano
            await fs.promises.mkdir(labelsDir, { recursive: true });
            
            const filePath = path.join(labelsDir, filename);
            console.log('💾 Salvo il PDF in:', filePath);

            // Crea write stream
            const writer = fs.createWriteStream(filePath);

            // Pipe la risposta direttamente nel file
            labelResponse.data.pipe(writer);

            // Attendi che il file sia salvato
            await new Promise((resolve, reject) => {
                writer.on('finish', () => {
                    console.log('✅ Stream PDF completato');
                    resolve();
                });
                writer.on('error', (err) => {
                    console.error('❌ Errore durante la scrittura:', err);
                    reject(err);
                });
                labelResponse.data.on('error', (err) => {
                    console.error('❌ Errore durante la lettura:', err);
                    reject(err);
                });
            });

            // Verifica che il file sia stato creato e non sia vuoto
            const stats = await fs.promises.stat(filePath);
            console.log('✅ PDF salvato con successo, dimensione:', stats.size, 'bytes');

            if (stats.size === 0) {
                throw new Error('Il file PDF salvato è vuoto');
            }

            const shipmentData = {
                success: true,
                orderId: orderData.orderId,
                trackingNumber,
                labelPath: filePath,
                ...orderData,
                createdAt: new Date().toISOString(),
                status: 'created'
            };

            // Salva la spedizione nel database
            await this.saveShipment(shipmentData);

            return shipmentData;

        } catch (error) {
            console.error('❌ Errore creazione spedizione:', error);
            if (error.response) {
                console.error('❌ Dettagli risposta:', {
                    status: error.response.status,
                    headers: error.response.headers,
                    data: error.response.data
                });
            }
            throw new Error(`Errore creazione spedizione: ${error.message}`);
        }
    }

    async saveShipment(shipmentData) {
        const shipmentsFile = path.join(process.cwd(), 'data', 'shipments.json');
        try {
            // Crea la directory se non esiste
            await fs.promises.mkdir(path.dirname(shipmentsFile), { recursive: true });

            // Leggi le spedizioni esistenti
            let shipments = [];
            try {
                const data = await fs.promises.readFile(shipmentsFile, 'utf8');
                shipments = JSON.parse(data);
            } catch (err) {
                // File non esiste o è vuoto, usa array vuoto
            }

            // Aggiungi la nuova spedizione
            shipments.push(shipmentData);

            // Salva il file aggiornato
            await fs.promises.writeFile(shipmentsFile, JSON.stringify(shipments, null, 2));

        } catch (error) {
            console.error('Errore nel salvataggio della spedizione:', error);
            throw new Error('Impossibile salvare i dati della spedizione');
        }
    }

    async getShipments() {
        const shipmentsFile = path.join(process.cwd(), 'data', 'shipments.json');
        try {
            const data = await fs.promises.readFile(shipmentsFile, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            // Se il file non esiste, ritorna array vuoto
            return [];
        }
    }

    async saveLabelPDF(orderId, label) {
        try {
            console.log('📄 Inizio salvataggio etichetta...');
            
            // Decodifica il PDF da base64
            const pdfBuffer = Buffer.from(label, 'base64');
            console.log('✅ PDF decodificato, dimensione:', pdfBuffer.length, 'bytes');
            
            // Genera nome file e percorsi
            const filename = `label_${orderId}.pdf`;
            const publicDir = path.join(process.cwd(), 'public');
            const labelsDir = path.join(publicDir, 'labels');
            
            console.log('📁 Verifico directory public:', publicDir);
            if (!fs.existsSync(publicDir)) {
                console.log('📁 Creo directory public...');
                fs.mkdirSync(publicDir, { recursive: true });
            }
            
            console.log('📁 Verifico directory labels:', labelsDir);
            if (!fs.existsSync(labelsDir)) {
                console.log('📁 Creo directory labels...');
                fs.mkdirSync(labelsDir, { recursive: true });
            }
            
            const filePath = path.join(labelsDir, filename);
            console.log('💾 Salvo il file in:', filePath);
            
            await fs.promises.writeFile(filePath, pdfBuffer);
            console.log('✅ File salvato con successo');
            
            // Verifica che il file sia stato creato
            if (fs.existsSync(filePath)) {
                const stats = fs.statSync(filePath);
                console.log(`✅ Verifica file: ${filePath} (${stats.size} bytes)`);
            } else {
                throw new Error('File non trovato dopo il salvataggio');
            }
            
            // Ritorna il path relativo per l'URL
            return { 
                filename,
                filePath,
                url: `/labels/${filename}` 
            };
        } catch (error) {
            console.error('❌ Errore salvataggio etichetta:', error);
            throw error;
        }
    }
}

module.exports = new ShippingService(); 