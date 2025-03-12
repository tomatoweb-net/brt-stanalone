const axios = require('axios');
const fs = require('fs');
const path = require('path');
const config = require('../config/config');

class BartoliniService {
    constructor() {
        this.api = axios.create({
            baseURL: 'https://api.brt.it',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
    }

    async generateLabel(orderData) {
        try {
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

            const response = await this.api.post('/rest/v1/shipments/shipment', requestData);
            const pdfData = Buffer.from(response.data.createResponse.labels.label[0].stream, 'base64');
            const pdfFileName = `etichetta_${orderData.orderId}_${Date.now()}.pdf`;
            const pdfPath = path.join(config.pdfPath, pdfFileName);
            
            if (!fs.existsSync(config.pdfPath)) {
                fs.mkdirSync(config.pdfPath, { recursive: true });
            }

            fs.writeFileSync(pdfPath, pdfData);
            
            return {
                pdfPath,
                trackingNumber: response.data.createResponse.parcelNumberFrom,
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

    async generateReturnLabel(orderData) {
        try {
            const requestData = {
                account: {
                    userID: config.bartolini.userId,
                    password: config.bartolini.password
                },
                createData: {
                    departureDepot: "102",
                    senderCustomerCode: "1020117",
                    deliveryFreightTypeCode: "DAP",
                    consigneeCompanyName: config.bartolini.companyName,
                    consigneeAddress: config.bartolini.address,
                    consigneeZIPCode: config.bartolini.zipCode,
                    consigneeCity: config.bartolini.city,
                    consigneeCountryAbbreviationISOAlpha2: "IT",
                    senderName: orderData.company || `${orderData.firstName} ${orderData.lastName}`,
                    senderAddress: orderData.address.substring(0, 35),
                    senderZIPCode: orderData.postcode,
                    senderCity: orderData.city,
                    senderCountryAbbreviationISOAlpha2: "IT",
                    numberOfParcels: 1,
                    weightKG: 1,
                    numericSenderReference: `R${orderData.orderId}`,
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

            const response = await this.api.post('/rest/v1/shipments/shipment', requestData);
            const pdfData = Buffer.from(response.data.createResponse.labels.label[0].stream, 'base64');
            const pdfFileName = `reso_${orderData.orderId}_${Date.now()}.pdf`;
            const pdfPath = path.join(config.pdfPath, pdfFileName);
            
            if (!fs.existsSync(config.pdfPath)) {
                fs.mkdirSync(config.pdfPath, { recursive: true });
            }

            fs.writeFileSync(pdfPath, pdfData);
            
            return {
                pdfPath,
                trackingNumber: response.data.createResponse.parcelNumberFrom,
                success: true
            };
        } catch (error) {
            console.error('Error in Bartolini return API call:', error.response?.data || error.message);
            throw new Error(
                'Errore nella generazione etichetta reso Bartolini: ' + 
                (error.response?.data?.message || error.message)
            );
        }
    }

    async getShipmentLabel(parcelID, orderId) {
        try {
            console.log('Richiedo etichetta per spedizione:', parcelID);
            
            const requestData = {
                account: {
                    userID: config.bartolini.userId,
                    password: config.bartolini.password
                },
                labelParameters: {
                    outputType: "PDF",
                    isBorderRequired: 0,
                    isLogoRequired: 0
                },
                parcelID: parcelID
            };

            console.log('Sending label request to Bartolini API:', JSON.stringify(requestData, null, 2));

            const response = await this.api.post('/rest/v1/shipments/label', requestData);
            console.log('Bartolini API label response:', response.data);

            if (!response.data?.label?.[0]?.stream) {
                throw new Error('Nessuna etichetta nella risposta Bartolini');
            }

            const pdfData = Buffer.from(response.data.label[0].stream, 'base64');
            const pdfFileName = `etichetta_${orderId}_${parcelID}_${Date.now()}.pdf`;
            const pdfPath = path.join(config.pdfPath, pdfFileName);
            
            if (!fs.existsSync(config.pdfPath)) {
                fs.mkdirSync(config.pdfPath, { recursive: true });
            }

            fs.writeFileSync(pdfPath, pdfData);
            console.log('PDF label saved to:', pdfPath);
            
            return {
                pdfPath,
                trackingNumber: parcelID,
                success: true
            };
        } catch (error) {
            console.error('Error getting Bartolini label:', error.response?.data || error.message);
            throw new Error(
                'Errore nel recupero etichetta Bartolini: ' + 
                (error.response?.data?.message || error.message)
            );
        }
    }
}

module.exports = new BartoliniService(); 