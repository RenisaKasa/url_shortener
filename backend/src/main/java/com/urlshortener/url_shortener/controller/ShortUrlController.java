package com.urlshortener.url_shortener.controller;

import com.urlshortener.url_shortener.dto.CreateUrlRequest;
import com.urlshortener.url_shortener.dto.CreateUrlResponse;
import com.urlshortener.url_shortener.service.ShortUrlService;

import jakarta.validation.Valid;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

import org.springframework.context.MessageSource;
import org.springframework.core.io.ClassPathResource;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.util.HtmlUtils;

@RestController
public class ShortUrlController {

    private final ShortUrlService service;
    private final MessageSource messages;
    private final String errorPage;

    public ShortUrlController(ShortUrlService service, MessageSource messages) throws IOException {
        this.service = service;
        this.messages = messages;
        this.errorPage = new ClassPathResource("pages/link-error.html")
                .getContentAsString(StandardCharsets.UTF_8);
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
    public ResponseEntity<?> redirect(@PathVariable String code,
            @RequestHeader(value = "Accept", defaultValue = "") String accept, Locale locale) {
        try {
            return ResponseEntity.status(HttpStatus.FOUND)
                    .location(service.resolve(code))
                    .varyBy("Accept")
                    .cacheControl(CacheControl.noStore())
                    .build();
        } catch (ResponseStatusException exception) {
            int status = exception.getStatusCode().value();
            boolean browser = MediaType.parseMediaTypes(accept).stream().anyMatch(type ->
                    "text".equals(type.getType()) && "html".equals(type.getSubtype())
                            && type.getQualityValue() > 0);
            if (!browser || (status != 404 && status != 410)) {
                throw exception;
            }
            String prefix = status == 410 ? "link.gone." : "link.missing.";
            String page = errorPage.replace("{{status}}", Integer.toString(status));
            for (String key : new String[]{"title", "description", "hint"}) {
                page = page.replace("{{" + key + "}}", HtmlUtils.htmlEscape(
                        messages.getMessage(prefix + key, null, locale)));
            }
            for (String key : new String[]{"brand", "home"}) {
                page = page.replace("{{" + key + "}}", HtmlUtils.htmlEscape(
                        messages.getMessage("link." + key, null, locale)));
            }
            return ResponseEntity.status(status)
                    .contentType(new MediaType("text", "html", StandardCharsets.UTF_8))
                    .varyBy("Accept")
                    .cacheControl(CacheControl.noStore())
                    .body(page);
        }
    }
}
