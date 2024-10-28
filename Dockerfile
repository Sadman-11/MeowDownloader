# Use Node.js 20 image as the base
FROM node:20

# Install FFmpeg, Python 3.11, and dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg wget build-essential libssl-dev zlib1g-dev libreadline-dev libsqlite3-dev libffi-dev && \
    wget https://www.python.org/ftp/python/3.11.0/Python-3.11.0.tgz && \
    tar xzf Python-3.11.0.tgz && \
    cd Python-3.11.0 && \
    ./configure --enable-optimizations && \
    make altinstall && \
    cd .. && \
    rm -rf Python-3.11.0 Python-3.11.0.tgz && \
    apt-get clean && \
    ln -sf /usr/local/bin/python3.11 /usr/bin/python

# Set the working directory
WORKDIR /usr/src/app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy the rest of the application files
COPY . .

# Expose the application port
EXPOSE 3000

# Command to start the Node.js application
CMD ["npm", "start"]

# Build
# $ docker build -t meow .
# Run docker
# $ docker run -it --rm -p 3000:3000 --name meow-app meow
