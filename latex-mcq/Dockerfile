FROM node:16-alpine

WORKDIR /app

# Copy package files first for better caching
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose port (Render will override with PORT env var)
EXPOSE 3000

# Run the application
CMD ["node", "server.js"]