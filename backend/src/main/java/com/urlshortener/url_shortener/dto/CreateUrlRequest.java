package com.urlshortener.url_shortener.dto;

import jakarta.validation.constraints.Future;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;

public record CreateUrlRequest(
        @NotBlank(message = "URL is required")
        @Size(max = 2048, message = "URL must not exceed 2048 characters")
        String originalUrl,

        @Pattern(
                regexp = "[A-Za-z0-9_-]{3,32}",
                message = "Alias must contain 3–32 letters, numbers, underscores or hyphens"
        )
        String customAlias,

        @Future(message = "Expiration date must be in the future")
        Instant expiresAt
) {}