idf_component_register(
    SRCS "main.cpp" "session_logger.cpp" "retention_policy.cpp"
         "session_store.cpp" "session_store_posix.cpp"
         "probe_config.cpp" "probe_config_store.cpp"
    INCLUDE_DIRS "."
    REQUIRES framework-arduinoespressif32 esp_littlefs espcoredump esp_system
             nvs_flash
)
