FROM node:18-alpine
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Expose the port for the health check
EXPOSE 3000

# Start the minting service with health check
CMD ['node', 'scripts/mintService.js']
