# Step 1: Build the React application
FROM node:20-alpine as build

WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies (using npm ci for cleaner production install)
RUN npm ci

# Copy source code
COPY . .

# Build the application
# We need to pass build-time environment variables if they are used
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_GHL_CLIENT_ID
ARG VITE_GHL_CLIENT_SECRET
ARG VITE_GHL_REDIRECT_URI

ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
ENV VITE_GHL_CLIENT_ID=$VITE_GHL_CLIENT_ID
ENV VITE_GHL_CLIENT_SECRET=$VITE_GHL_CLIENT_SECRET
ENV VITE_GHL_REDIRECT_URI=$VITE_GHL_REDIRECT_URI

RUN npm run build

# Step 2: Serve the application using Nginx
FROM nginx:alpine

# Copy the build output from Step 1
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start Nginx
CMD ["nginx", "-g", "daemon off;"]
