package com.urlshortener.url_shortener.exception;

import java.util.Map;

public record ApiError(int status, String message, Map<String, String> fieldErrors) {
    public ApiError(int status, String message) { this(status, message, Map.of()); }
}
