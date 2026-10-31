package com.urlshortener.url_shortener.controller;

import com.urlshortener.url_shortener.dto.CreateUrlRequest;
import com.urlshortener.url_shortener.dto.CreateUrlResponse;
import com.urlshortener.url_shortener.service.ShortUrlService;

import jakarta.validation.Valid;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

@RestController
public class ShortUrlController {

    private final ShortUrlService service;

    public ShortUrlController(ShortUrlService service) {
        this.service = service;
    }

    @PostMapping("/api/urls")
    public ResponseEntity<CreateUrlResponse> create(
            @Valid @RequestBody CreateUrlRequest request
    ) {
        var url = service.create(request);

        String shortUrl = ServletUriComponentsBuilder
                .fromCurrentContextPath()
                .path("/r/{code}")
                .buildAndExpand(url.getShortCode())
                .toUriString();

        var response = new CreateUrlResponse(
                url.getId(),
                url.getOriginalUrl(),
                url.getShortCode(),
                shortUrl,
                url.getExpiresAt()
        );

        return ResponseEntity.status(HttpStatus.CREATED).body(response);
    }

    @GetMapping("/r/{code}")
    public ResponseEntity<Void> redirect(@PathVariable String code) {
        return ResponseEntity.status(HttpStatus.FOUND)
                .location(service.resolve(code))
                .cacheControl(CacheControl.noStore())
                .build();
    }
}