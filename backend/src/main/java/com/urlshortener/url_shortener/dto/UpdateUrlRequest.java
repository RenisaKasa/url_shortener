package com.urlshortener.url_shortener.dto;
import jakarta.validation.constraints.Future;

import java.time.Instant;

public record UpdateUrlRequest(
    Boolean active,
    @Future(message= "Expiration date must be in the future")
    Instant expiresAt
){}
