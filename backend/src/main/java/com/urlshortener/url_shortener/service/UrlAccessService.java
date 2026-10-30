package com.urlshortener.url_shortener.service;

import com.urlshortener.url_shortener.entity.ShortUrl;
import com.urlshortener.url_shortener.repository.ShortUrlRepository;
import com.urlshortener.url_shortener.security.AccountPrincipal;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/** Use this lookup in future URL update/delete/statistics services to enforce ownership. */
@Service
public class UrlAccessService {
    private final ShortUrlRepository urls;
    public UrlAccessService(ShortUrlRepository urls) { this.urls = urls; }

    @Transactional(readOnly = true)
    @PreAuthorize("isAuthenticated()")
    public ShortUrl requireOwnedUrl(Long id) {
        var owner = (AccountPrincipal) SecurityContextHolder.getContext().getAuthentication().getPrincipal();
        return urls.findByIdAndUserId(id, owner.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "URL not found"));
    }
}
