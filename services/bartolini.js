const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class BartoliniService {
    constructor() {
        this.api = axios.create({
            baseURL: 'https://api.brt.it/rest/v1',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    async generateLabel(orderData) {
        try {
            // Determina se l'ordine è in contrassegno
            const isCashOnDelivery = orderData.paymentMethod === 'cod' || orderData.paymentMethod === 'contrassegno';
            const codAmount = isCashOnDelivery ? parseFloat(orderData.total) : 0;

            const requestData = {
                account: {
                    userID: config.bartolini.userId,
                    password: config.bartolini.password
                },
                createData: {
                    departureDepot: "102",
                    senderCustomerCode: "1020117",
                    deliveryFreightTypeCode: "DAP",
                    consigneeCompanyName: orderData.company || `${orderData.firstName} ${orderData.lastName}`,
                    consigneeAddress: orderData.address.substring(0, 35),
                    consigneeZIPCode: orderData.postcode,
                    consigneeCity: orderData.city,
                    consigneeCountryAbbreviationISOAlpha2: "IT",
                    numberOfParcels: 1,
                    weightKG: 1,
                    numericSenderReference: orderData.orderId.toString(),
                    isCODMandatory: isCashOnDelivery ? 1 : 0,
                    cashOnDelivery: codAmount,
                    codCurrency: isCashOnDelivery ? "EUR" : null
                },
                isLabelRequired: 1,
                labelParameters: {
                    outputType: "PDF"
                }
            };

            // Prima creiamo la spedizione
            console.log('📦 Creazione spedizione...');
            const response = await this.api.post('/shipments/shipment', requestData);
            
            if (!response.data?.createResponse) {
                throw new Error('Risposta API non valida');
            }

            const createResponse = response.data.createResponse;
            console.log('📦 Risposta creazione:', createResponse);

            // Verifica se c'è un errore nella risposta
            if (createResponse.executionMessage?.severity === 'ERROR') {
                throw new Error(`Errore BRT: ${createResponse.executionMessage.message}`);
            }

            const parcelID = createResponse.parcelNumberFrom;
            if (!parcelID) {
                throw new Error('Numero tracking non trovato nella risposta');
            }

            let pdfData;
            let labelSource = 'creation';

            // Prima proviamo a prendere l'etichetta dalla risposta di creazione
            if (createResponse.labels?.label?.[0]?.stream) {
                console.log('📄 Etichetta trovata nella risposta di creazione');
                pdfData = Buffer.from(createResponse.labels.label[0].stream, 'base64');
            } else {
                // Se non c'è l'etichetta nella risposta, la richiediamo separatamente
                console.log('📄 Richiedo etichetta separatamente...');
                labelSource = 'separate';
                
                const labelResponse = await this.api.post('/shipments/label', {
                    account: {
                        userID: config.bartolini.userId,
                        password: config.bartolini.password
                    },
                    parcelID: parcelID,
                    outputType: "PDF"
                }, {
                    responseType: 'arraybuffer',
                    headers: {
                        'Accept': 'application/pdf'
                    }
                });

                if (!labelResponse.data || labelResponse.data.length === 0) {
                    throw new Error('Etichetta PDF non trovata nella risposta');
                }

                pdfData = Buffer.from(labelResponse.data);
            }

            // Salva il PDF
            const pdfFileName = `etichetta_${orderData.orderId}_${Date.now()}.pdf`;
            const pdfPath = path.join(config.pdfPath, pdfFileName);
            
            if (!fs.existsSync(config.pdfPath)) {
                fs.mkdirSync(config.pdfPath, { recursive: true });
            }

            fs.writeFileSync(pdfPath, pdfData);
            
            // Verifica che il file sia stato creato e non sia vuoto
            const stats = fs.statSync(pdfPath);
            if (stats.size === 0) {
                throw new Error('Il file PDF generato è vuoto');
            }

            console.log(`✅ PDF salvato con successo (${labelSource}), dimensione:`, stats.size, 'bytes');
            
            return {
                pdfPath,
                trackingNumber: parcelID,
                success: true
            };
        } catch (error) {
            console.error('Error in Bartolini API call:', error.response?.data || error.message);
            throw new Error(
                'Errore nella generazione etichetta Bartolini: ' + 
                (error.response?.data?.message || error.message)
            );
        }
    }
}

module.exports = new BartoliniService(); 