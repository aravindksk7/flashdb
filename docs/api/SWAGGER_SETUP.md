# Swagger UI Setup Guide

## Overview

This guide explains how to set up and use Swagger UI to interactively test the FlashDB REST API. Swagger UI provides a user-friendly interface for exploring endpoints, sending requests, and viewing responses.

## Prerequisites

- Node.js 16+ installed
- FlashDB API running on `http://localhost:3001`
- OpenAPI specification file (`openapi.json`)

## Installation

### Option 1: Using swagger-ui-express (Recommended for Production)

Install the Swagger UI Express middleware in your Node.js project:

```bash
npm install swagger-ui-express
```

Then update your `src/index.ts`:

```typescript
import swaggerUi from 'swagger-ui-express';
import swaggerDocument from '../docs/api/openapi.json';

// Add Swagger UI middleware
app.use('/api/docs', swaggerUi.serve);
app.get('/api/docs', swaggerUi.setup(swaggerDocument));
```

### Option 2: Using Standalone Swagger UI

Download Swagger UI distribution from https://github.com/swagger-api/swagger-ui/releases

Extract the dist folder and host it as a static website, then configure it to point to your OpenAPI spec:

```html
<!-- In index.html -->
<script>
  window.onload = function() {
    window.ui = SwaggerUIBundle({
      url: "http://localhost:3001/api/openapi.json",
      dom_id: '#swagger-ui',
      presets: [
        SwaggerUIBundle.presets.apis,
        SwaggerUIBundle.SwaggerUIStandalonePreset
      ],
      layout: "BaseLayout"
    })
  }
</script>
```

### Option 3: Using Docker

Pull the official Swagger UI Docker image:

```bash
docker run -d -p 8080:8080 \
  -e SWAGGER_JSON_URL=http://host.docker.internal:3001/api/openapi.json \
  swaggerapi/swagger-ui
```

Then access Swagger UI at `http://localhost:8080`

## Accessing Swagger UI

Once Swagger UI is configured, access it at:

```
http://localhost:3001/api/docs
```

You should see the FlashDB API documentation with all endpoints listed.

## Using Swagger UI

### 1. Explore Endpoints

- Endpoints are grouped by tags (Golden Images, Clones, Checkpoints, etc.)
- Click any endpoint to expand it and view details
- Review request parameters, request body schema, and response schemas

### 2. Try It Out

1. Click the "Try it out" button on any endpoint
2. Fill in required parameters:
   - Path parameters (e.g., `imageId`, `cloneId`)
   - Query parameters (e.g., `limit`, `offset`)
   - Request body (for POST/PUT operations)
3. Click "Execute" to send the request
4. View the response status, headers, and body

### 3. Example: Create a Clone

1. Navigate to the "Clones" section
2. Expand "POST /clones"
3. Click "Try it out"
4. Fill in the request body:
   ```json
   {
     "name": "test-clone-001",
     "goldenImageId": "golden-prod-20260606",
     "compress": false
   }
   ```
5. Click "Execute"
6. View the response with the created clone details

### 4. Example: List Checkpoints

1. Navigate to "Checkpoints" section
2. Expand "GET /clones/{cloneId}/checkpoints"
3. Click "Try it out"
4. Enter a valid `cloneId` value
5. Click "Execute"
6. View all checkpoints for that clone

## API Response Format

All FlashDB API responses follow this standard format:

```json
{
  "success": true,
  "data": { ... },
  "message": "Optional message"
}
```

## Error Handling

Common HTTP status codes:

- **200 OK**: Successful GET/POST response
- **201 Created**: Resource created successfully
- **400 Bad Request**: Invalid request parameters
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: Server error

Error response format:

```json
{
  "success": false,
  "message": "Error description"
}
```

## Authentication (Future)

When authentication is enabled, add the API key to requests:

```
Authorization: Bearer <your-api-token>
```

In Swagger UI, use the "Authorize" button to set your token globally.

## Export and Share

Swagger UI allows you to:

1. **Download OpenAPI Spec**: Click the download icon to get `openapi.json`
2. **Share API Documentation**: Generate shareable links with Swagger Hub
3. **Generate Client Code**: Use tools like OpenAPI Generator to create SDKs

## Troubleshooting

### CORS Errors

If Swagger UI can't communicate with the API, ensure CORS is enabled:

```typescript
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:8080'],
  credentials: true
}));
```

### OpenAPI Spec Not Loading

1. Verify the `openapi.json` file exists at the correct path
2. Check that the file is valid JSON (use a JSON validator)
3. Ensure the file is referenced correctly in your code
4. Restart the API server

### Endpoints Not Showing

1. Verify the OpenAPI spec includes all endpoints
2. Check that the paths section matches your actual routes
3. Validate the spec at https://editor.swagger.io/

## OpenAPI Spec Structure

The FlashDB OpenAPI specification includes:

- **Servers**: Base URLs for dev and production
- **Paths**: All API endpoints with methods
- **Components**: Reusable schemas and responses
- **Tags**: Logical grouping of endpoints
- **Security**: Authentication requirements (future)

## Further Reading

- [OpenAPI 3.0 Specification](https://spec.openapis.org/oas/v3.0.3)
- [Swagger UI Documentation](https://swagger.io/tools/swagger-ui/)
- [OpenAPI Tutorial](https://swagger.io/blog/api-design/openapi-tutorial/)

## Support

For issues with Swagger UI setup, consult:

1. Swagger UI GitHub: https://github.com/swagger-api/swagger-ui
2. OpenAPI Editor: https://editor.swagger.io/
3. FlashDB Documentation: See the DEVELOPER_GUIDE.md
