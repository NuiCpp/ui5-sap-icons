#!/bin/env bash

set -e
set -u

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )
NUI_VERSION="b235c47e2bd849607eb6e6f2e9159ac1d9080657"

cd "${SCRIPT_DIR}"

if [ -d "Nui" ]; then
    echo "Nui directory already exists, skipping clone."
else
    git clone https://github.com/NuiCpp/Nui.git || exit 1
fi
cd Nui
git fetch --all
git checkout "${NUI_VERSION}"
cd "${SCRIPT_DIR}"

mkdir -p build
cd build

cmake -S ../Nui -B . -DCMAKE_CXX_COMPILER=clang++ -DCMAKE_CXX_STANDARD=23 -DCMAKE_C_COMPILER=clang -DCMAKE_BUILD_TYPE=Release -DNUI_BUILD_XML_TOOL=ON -DNUI_BUILD_TESTS=OFF
cmake --build . --target xml-to-nui -j 8

cd "${SCRIPT_DIR}"

node main.mjs --concurrency 8