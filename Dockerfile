# syntax = docker/dockerfile:1

# Adjust NODE_VERSION as desired
ARG NODE_VERSION=22.17.0
FROM node:${NODE_VERSION}-slim AS base

LABEL fly_launch_runtime="Node.js"

# Node.js app lives here
WORKDIR /app

# Set production environment
ENV NODE_ENV="production"

# Install pnpm
ARG PNPM_VERSION=10.11.0
RUN npm install -g pnpm@$PNPM_VERSION


# Throw-away build stage to reduce size of final image
FROM base AS build

# Install node modules
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# Copy application code
COPY . .
RUN pnpm build
RUN pnpm prune --prod --ignore-scripts

WORKDIR /app/examples/chat-ui

RUN pnpm install --frozen-lockfile --prod=false

# Build application
RUN pnpm run build
RUN pnpm prune --prod --ignore-scripts

# Final stage for app image
FROM base

RUN npm install -g serve

# Copy built application
COPY --from=build /app /app

WORKDIR /app/examples/chat-ui

# Start the server by default, this can be overwritten at runtime
CMD [ "serve", "-s", "-p", "3000", "/app/examples/chat-ui/dist" ]
