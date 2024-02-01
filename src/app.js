/**
 * Copyright 2021-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Messenger Platform Quick Start Tutorial
 *
 * This is the completed code for the Messenger Platform quick start tutorial
 *
 * https://developers.facebook.com/docs/messenger-platform/getting-started/quick-start/
 *
 * To run this code, you must do the following:
 *
 * 1. Deploy this code to a server running Node.js
 * 2. Run `yarn install`
 * 3. Add your conf.VERIFY_TOKEN and conf.PAGE_ACCESS_TOKEN to your environment vars
 */

'use strict';

// Use dotenv to read .env vars into Node
require('dotenv').config();
const uuid = require("uuid");

// Imports dependencies and set up http server
const
    request = require('request'),
    express = require('express'),
    FormData = require('form-data'),
    querystring = require('querystring'),
    axios = require('axios'),
    { urlencoded, json } = require('body-parser'),
    fs = require('fs');

const app = express(),
    conf = JSON.parse(fs.readFileSync('conf.json'));


// Parse application/x-www-form-urlencoded
app.use(urlencoded({ extended: true }));

// Parse application/json
app.use(json());

function log_request(req) {
    let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    let datetime = new Date();
    let requestMethod = req.method;
    var fullUrl = req.protocol + '://' + req.get('host') + req.originalUrl;
    console.log(ip + " | " + datetime.toISOString() + " | " + requestMethod + " | " + fullUrl);
}

// Respond with 'Hello World' when a GET request is made to the homepage
app.get('/', function (_req, res) {
    res.send('<h1>Running MelisaBot for Meta</h1>');
});

// Adds support for GET requests to our webhook
app.get('/webhook', (req, res) => {
    log_request(req);

    // Parse the query params
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    console.log('WEBHOOK | CHECK |' + mode + " | " + token + " | " + challenge);

    // Checks if a token and mode is in the query string of the request
    if (mode && token) {

        // Checks the mode and token sent is correct
        if (mode === 'subscribe' && token === conf.VERIFY_TOKEN) {

            // Responds with the challenge token from the request
            console.log('WEBHOOK_VERIFIED');
            res.status(200).send(challenge);

        } else {
            // Responds with '403 Forbidden' if verify tokens do not match
            res.sendStatus(403);
        }
    }
});
// Creates the endpoint for your webhook
app.post('/webhook', (req, res) => {
    console.log("request: " + typeof (req))
    log_request(req);
    let body = req.body;
    //console.log("body: " + JSON.stringify(body))
    console.log('WEBHOOK | MESSAGE | ' + JSON.stringify(body));
    // Iterates over each entry - there may be multiple if batched

    body.entry.forEach(function (entry) {
        var senderPsid = "",
            message = "",
            user_tags = {},
            message_tags = {};
        // Checks if this is an event from a page subscription
        if (body.object === 'page') {
            user_tags = { service: "facebook" };
            // Gets the body of the webhook event
            let webhookEvent = entry.messaging[0];

            // Get the id sender
            senderPsid = webhookEvent.sender.id;
            // Check if the event is a message or postback
            if (webhookEvent.message) {
                if (webhookEvent.message.text) {
                    message = webhookEvent.message.text;
                } else if (webhookEvent.message.attachments && webhookEvent.message.attachments.length > 0) {
                    // Check if the message contains an image
                    let attachment = webhookEvent.message.attachments[0];
                    if (attachment.type === 'image') {
                        message = ["facebook,image", webhookEvent]
                    }
                }
            }
        }
        else if (body.object === 'whatsapp_business_account') {
            let webhookEvent = entry.changes[0].value;

            user_tags = {
                service: "whatsapp",
                wp_id: entry.id,
                phone: webhookEvent.metadata.display_phone_number,
                phone_id: webhookEvent.metadata.phone_number_id
            };

            // Check if contact exists
            if (webhookEvent.contacts && webhookEvent.contacts[0].profile) {
                user_tags.name = webhookEvent.contacts[0].profile.name;
            }
            // Check if message comes in the request
            if (webhookEvent.messages && webhookEvent.messages[0].text) {
                // Get the id sender
                senderPsid = webhookEvent.messages[0].from;
                message = webhookEvent.messages[0].text.body;
                message_tags = {
                    wp_id: webhookEvent.metadata.phone_number_id
                }
                // Check if the message contains an image
            } else if (webhookEvent.messages && webhookEvent.messages[0].type === "image") {
                message = ["whatsapp,image", webhookEvent]
                message_tags = {
                    wp_id: webhookEvent.metadata.phone_number_id
                }
            }
        }
        // Send
        SendRequestDemeter(senderPsid, message, user_tags, message_tags);
    });
    // Returns a '200 OK' response to all requests
    res.status(200).send('EVENT_RECEIVED');
});

// Función para serializar objetos anidados recursivamente
function stringifyNested(obj, prefix = '') {
    return Object.entries(obj).map(([key, value]) => {
        const fullKey = prefix ? `${prefix}.${key}` : key;

        if (typeof value === 'object' && value !== null) {
            return stringifyNested(value, fullKey);
        } else {
            return `${encodeURIComponent(fullKey)}=${encodeURIComponent(value)}`;
        }
    }).join('&');
}

// Handles messages events
function SendRequestDemeter(senderPsid, message, user_tags, message_tags) {
    //console.log('WEBHOOK | REQUEST | ' + senderPsid + ' | ' + message + " | " + user_tags + " | " + message_tags);

    //Handling images
    if (message[0] && message[0].split(",")[1] === "image") {
        handleImage(message[1], message[0].split(",")[0], user_tags, message_tags);
    }
    else {
        let json = {
            melisa: conf.MELISA_NAME,
            token: conf.TOKEN_DEMETER,
            user: senderPsid,
            message: message,
            user_tags: user_tags,
            message_tags: message_tags,
            kind: "text"
        }

        // Convierte el objeto en una cadena de consulta
        const formBody = stringifyNested(json);


        //Configuración de la solicitud
        const options = {
            uri: conf.DEMETER_URL,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: formBody,
        };

        if(json.user !='' && json.message !=''){
            // Realiza la solicitud
            request(options, (err, _res, _body) => {
                if (!err) {
                    console.log('WEBHOOK | RESPONSE | ' + _res.body);
                } else {
                    console.log('WEBHOOK | ERROR | ' + err);
                }
            });

        }

    }
}

// Handles images events
function handleImage(imageData, platform, user_tags = null, message_tags = null) {
    // Check if the platform is Facebook
    if (platform === "facebook") {
        // Access the image URL from the attachments
        const image = imageData.message.attachments[0].payload.url;

        // Save the image
        const dateToday = new Date();
        const year = dateToday.getFullYear();
        const month = String(dateToday.getMonth() + 1).padStart(2, "0");
        const day = String(dateToday.getDate()).padStart(2, "0");
        const dateString = `${year}${month}${day}`;
        // Generate a random UUID
        const id = uuid.v4();
        // Get image format
        const format = image.split("?")[0].substring(image.split("?")[0].lastIndexOf(".") + 1);
        const senderPsid = imageData.sender.id;
        const imagePath = `.//images/${dateString}/${senderPsid}/${id}.${format}`;
        // Create the directory if it doesn't exist
        const directoryPath = `.//images/${dateString}/${senderPsid}`;
        if (!fs.existsSync(directoryPath)) {
            try {
                fs.mkdirSync(directoryPath, { recursive: true });
            } catch (error) {
                console.error(error);
            }
        }

        axios({
            method: 'get',
            url: image,
            responseType: 'arraybuffer', // Set the responseType to 'arraybuffer'
        }).then(response => {

            // Write image to the directory
            fs.writeFileSync(imagePath, response.data);

            //callSendAPIFacebook(senderPsid, { 'text': "Imagen almacenada correctamente" });

            const form = new FormData();
            form.append('file', fs.createReadStream(imagePath), {
                filename: `${id}.${format}`,
                contentType: `image/${format}`,
            });

            const jsonData = {
                melisa: conf.MELISA_NAME,
                token: conf.TOKEN_DEMETER,
                user: senderPsid,
                message: "",
                user_tags: user_tags,
                message_tags: message_tags,
                kind: "img",
            };

            // Añadir los datos JSON al FormData
            Object.keys(jsonData).forEach(key => {
                const value = jsonData[key];
                if (key === "user_tags" || key === "message_tags") {
                    // Añadir campos anidados al FormData directamente
                    Object.keys(value).forEach(subKey => {
                        form.append(`${key}.${subKey}`, value[subKey]);
                    });
                } else {
                    form.append(key, value);
                }
            });


            // Configuración de la solicitud con Axios
            const axiosConfig = {
                method: 'post',
                url: conf.DEMETER_URL,
                headers: {
                    ...form.getHeaders(),
                    'Content-Type': 'multipart/form-data',
                },
                data: form,
            };

            // Realizar la solicitud con Axios
            axios(axiosConfig)
                .then(response => {
                    console.log('WEBHOOK | RESPONSE | ' + response.data);
                })
                .catch(error => {
                    console.log('WEBHOOK | ERROR | ' + error);
                })
        });
    } else if (platform === "whatsapp") {

        // Generate a random UUID
        const id = uuid.v4();
        const format = "jpg"
        const dateToday = new Date();
        const year = dateToday.getFullYear();
        const month = String(dateToday.getMonth() + 1).padStart(2, "0");
        const day = String(dateToday.getDate()).padStart(2, "0");
        const dateString = `${year}${month}${day}`;
        const senderPsid = imageData.messages[0].from;

        // Create the directory if it doesn't exist
        const directoryPath = `.//images/${dateString}/${senderPsid}`;
        if (!fs.existsSync(directoryPath)) {
            try {
                fs.mkdirSync(directoryPath, { recursive: true });
            } catch (error) {
                console.error(error);
            }
        }

        const imageId = imageData.messages[0].image.id;
        const apiUrl = `https://graph.facebook.com/v18.0/${imageId}`;
        const accessToken = conf.PAGE_ACCESS_TOKEN2;

        // Configuración de los headers con el token de autorización
        const config = {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        };
        // Realizar la consulta GET a la URL con imageId como parámetro y el encabezado de autorización
        axios.get(apiUrl, config)
            .then(response => {

                // Verificar si la respuesta contiene una propiedad 'url'
                if (response.data.url) {
                    // Realizar otra consulta GET a la URL proporcionada en response.data.url
                    config.responseType = 'arraybuffer';
                    axios.get(response.data.url, config).then(imageResponse => {
                        // Escribe la imagen en el directorio
                        fs.writeFileSync(`${directoryPath}/${id}.${format}`, imageResponse.data, 'binary');
                        console.log("Imagen guardada correctamente")

                        //Sending image to Demeter
                        const form = new FormData();
                        form.append('file', fs.createReadStream(`${directoryPath}/${id}.${format}`), {
                            filename: `${id}.${format}`,
                            contentType: `image/${format}`,
                        });

                        const jsonData = {
                            melisa: conf.MELISA_NAME,
                            token: conf.TOKEN_DEMETER,
                            user: senderPsid,
                            message: "",
                            user_tags: user_tags,
                            message_tags: message_tags,
                            kind: "img",
                        };

                        // Añadir los datos JSON al FormData
                        Object.keys(jsonData).forEach(key => {
                            const value = jsonData[key];
                            if (key === "user_tags" || key === "message_tags") {
                                // Añadir campos anidados al FormData directamente
                                Object.keys(value).forEach(subKey => {
                                    form.append(`${key}.${subKey}`, value[subKey]);
                                });
                            } else {
                                form.append(key, value);
                            }
                        });

                        // Configuración de la solicitud con Axios
                        const axiosConfig = {
                            method: 'post',
                            url: conf.DEMETER_URL,
                            headers: {
                                ...form.getHeaders(),
                                'Content-Type': 'multipart/form-data',
                            },
                            data: form,
                        };

                        // Realizar la solicitud con Axios
                        axios(axiosConfig)
                            .then(response => {
                                console.log('WEBHOOK | RESPONSE | ' + response.data);
                            })
                            .catch(error => {
                                console.log('WEBHOOK | ERROR | ' + error);
                            })
                    }).catch(error => {
                        console.error('Error al descargar la imagen:', error);
                    });
                } else {
                    // No hay URL en la respuesta
                    console.log('La respuesta no contiene una URL adicional.');
                }
            })
            .catch(error => {
                // Manejar errores aquí, por ejemplo, imprimir el error
                console.error(error);
            });


    }
}

// Creates the endpoint for receptor
app.post('/receptor', (req, res) => {
    log_request(req);
    let body = req.body;
    let token = body.token,
        messages = body.text,
        senderPsid = body.user_id;
    // Checks if this is an event from a page subscription
    if (token === conf.TOKEN_DEMETER) {

        // Iterates over each entry - there may be multiple if batched
        messages.forEach(function (message) {
            if (message != "") {
                let response = { 'text': message };
                if (body.message_tags && body.message_tags.wp_id) {
                    callSendAPIWhatsapp(senderPsid, response, body.message_tags.wp_id)
                }
                else {
                    callSendAPIFacebook(senderPsid, response);
                }
            }
        });

        // Returns a '200 OK' response to all requests
        res.status(200).send('EVENT_RECEIVED');
    } else {

        // Returns a '404 Not Found' if event is not from a page subscription
        res.sendStatus(404);
    }
});


// Sends response messages via the Send API
function callSendAPIFacebook(senderPsid, message) {
    // Construct the message body
    const response = {
        "recipient": {
            "id": senderPsid
        },
        "message": message
    };

    // Send the HTTP request to the Messenger Platform
    request({
        "uri": "https://graph.facebook.com/v2.6/me/messages",
        "qs": { "access_token": conf.PAGE_ACCESS_TOKEN },
        "method": "POST",
        "json": response
    }, (err, _res, _body) => {
        if (!err) {
            console.log('Message sent to FACEBOOK!');
        } else {
            console.error('Unable to send message FACEBOOK:' + err);
        }
    });
}



function callSendAPIWhatsapp(senderPsid, response, from) {
    const json = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": senderPsid,
        "type": "text",
        "text": { "preview_url": false, "body": response.text }
    };

    request({
        'uri': 'https://graph.facebook.com/v13.0/' + from + '/messages',
        'qs': { 'access_token': conf.PAGE_ACCESS_TOKEN2 },
        'method': 'POST',
        'json': json
    }, (err, _res, _body) => {
        if (!err) {
            console.log('Message sent WHATSAPP!');
        } else {
            console.error('Unable to send message WHATSAPP:' + err);
        }
    });
}

// listen for requests :)
var listener = app.listen(conf.PORT, conf.HOSTNAME, function () {
    console.log('Melisa is listening on port ' + listener.address().port);
});

// nohup npm start > melisa.log 2>&1 &
