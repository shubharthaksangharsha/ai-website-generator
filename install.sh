#!/bin/bash

# Function to install Node.js and npm
install_node_npm() {
  echo "Installing Node.js and npm..."

  if command -v node > /dev/null && command -v npm > /dev/null; then
    echo "Node.js and npm are already installed."
  else
    # Detect OS
    OS=$(uname -s)
    case "$OS" in
      Linux)
        echo "Detected OS: Linux"
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
        ;;
      Darwin)
        echo "Detected OS: macOS"
        brew install node
        ;;
      *)
        echo "OS not supported by this script."
        exit 1
        ;;
    esac

    echo "Node.js and npm installation completed."
  fi
}


# Install dependencies
install_dependencies() {
  echo "Installing project dependencies..."
  npm install
  echo "Dependencies installed successfully."
}

# Prompt user to enter API keys and create .env file
create_env_file() {
  echo "Creating .env file..."
  read -p "Enter your Google API Key: " google_api_key
  read -p "Enter your OpenAI API Key: " openai_api_key
  read -p "Enter your Groq API Key: " groq_api_key
  read -p "Enter your Anthropic API Key: " $anthropic_api_key

  cat <<EOL > .env
GOOGLE_API_KEY=$google_api_key
OPENAI_API_KEY=$openai_api_key
GROQ_API_KEY=$groq_api_key
ANTHROPIC_API_KEY=$anthropic_api_key
EOL

  echo ".env file created successfully."
}

# Start the development server
start_server() {
  echo "Starting the development server..."
  node app.js
  echo "Server is running at http://localhost:3000"
}

# Execute the functions
install_node_npm
install_dependencies
create_env_file
start_server

