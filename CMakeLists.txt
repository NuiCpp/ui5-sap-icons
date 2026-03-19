cmake_minimum_required(VERSION 3.21)

project(ui5-sap-icons
    VERSION 0.1.0
    DESCRIPTION "Nui-fied UI5 SAP icons."
    LANGUAGES CXX
)

add_library(ui5-sap-icons INTERFACE)
target_include_directories(ui5-sap-icons INTERFACE "${CMAKE_CURRENT_LIST_DIR}/include")