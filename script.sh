#!/bin/bash

PASTAS=("app/file-cleaner" "app/image-processor" "app/pdf-merger" "app/pdf-splitter" "ihatepdf")
HOME_DIR=$(pwd)
for pasta in "${PASTAS[@]}"; do
    echo "Processing $pasta"
    cd "$HOME_DIR/$pasta" || { echo "Failed to change directory to $pasta"; continue; }
    if [ -f "package.json" ]; then
        if [ -d "node_modules" ]; then
            echo "node_modules already exists, skipping installation"
        else
            echo "Installing node modules for $pasta"
            npm install
        fi

    else
        echo "No package.json found in $pasta"
    fi
    cd "$HOME_DIR" || { echo "Failed to return to home directory"; exit 1; }
    echo "Finished processing $pasta"
    echo "----------------------------------------"
done
  echo "Compilling frontend"
  cd "$HOME_DIR/ihatepdf" || { echo "Failed to change directory to frontend"; exit 1; }
  if [ ! -d "$HOME_DIR/ihatepdf/.next/static/chunks/pages/" ]; then
      npm run build || { echo "Failed to build frontend"; exit 1; }
      echo "Frontend compiled successfully"
  else
      echo "compiled frontend already exists, skipping build"
      echo "If you want to recompile, delete the .next folder in ihatepdf"
      echo "and run this script again"
  fi
  
  cd "$HOME_DIR" || { echo "Failed to return to home directory"; exit 1; }



  # Verifica se já existe um container rodando com nome que contenha "serverles-front-nest"
if docker ps --format '{{.Names}}' | grep -q "serverles-front-nest"; then
    echo "O container serverles-front-nest já está rodando. Projeto já está em execução."
else
    docker compose up -d || { echo "Failed to start Docker containers"; exit 1; }
    echo "Docker containers iniciados com sucesso."
fi

echo "All tasks completed successfully"