package com.urlshortener.url_shortener.dto;

import jakarta.validation.constraints.NotNull;

public record AccountStatusRequest(@NotNull Boolean active) {}
