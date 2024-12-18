const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const swaggerOptions = {
    swaggerDefinition: {
      openapi: '3.0.0',
      info: {
        title: 'Bus Management API',
        version: '1.0.0',
        description: 'API for managing buses and users',
      },
      servers: [{ url: 'http://localhost:5000' }],
    },
    apis: ['./server.js'],
  };
  

const swaggerSpec = swaggerJSDoc(options);

const setupSwagger = (app) => {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  console.log('Swagger UI töötab aadressil http://localhost:5000/api-docs');
};

module.exports = setupSwagger;
