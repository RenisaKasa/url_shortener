package com.urlshortener.url_shortener.controller;

import com.urlshortener.url_shortener.dto.ShortUrlResponse;
import com.urlshortener.url_shortener.dto.UpdateUrlRequest;
import com.urlshortener.url_shortener.dto.UrlStatus;
import com.urlshortener.url_shortener.query.PageRequests;
import com.urlshortener.url_shortener.service.UrlManagementService;

import jakarta.validation.Valid;

import org.springframework.data.domain.Page;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/urls")
public class UrlManagementController {

    private final UrlManagementService service;

    public UrlManagementController(UrlManagementService service) {
        this.service = service;
    }

    @GetMapping
    public Page<ShortUrlResponse> list(
            @RequestParam(required = false) String search,
            @RequestParam(required = false) UrlStatus status,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(defaultValue = "createdAt,desc") String sort
    ) {
        return service.list(
                search,
                status,
                PageRequests.urls(page, size, sort)
        );
    }

    @GetMapping("/{id}")
    public ShortUrlResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PatchMapping("/{id}")
    public ShortUrlResponse update(
            @PathVariable Long id,
            @Valid @RequestBody UpdateUrlRequest request
    ) {
        return service.update(id, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}