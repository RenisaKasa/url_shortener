package com.urlshortener.url_shortener.service;

import com.urlshortener.url_shortener.dto.ShortUrlResponse;
import com.urlshortener.url_shortener.dto.UpdateUrlRequest;
import com.urlshortener.url_shortener.dto.UrlStatus;
import com.urlshortener.url_shortener.query.SearchSpecifications;
import com.urlshortener.url_shortener.repository.ShortUrlRepository;
import com.urlshortener.url_shortener.security.AccountPrincipal;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;

@Service
@PreAuthorize("isAuthenticated()")
@Transactional(readOnly = true)
public class UrlManagementService {

    private final ShortUrlRepository urls;
    private final UrlAccessService access;

    public UrlManagementService(
            ShortUrlRepository urls,
            UrlAccessService access
    ) {
        this.urls = urls;
        this.access = access;
    }

    public Page<ShortUrlResponse> list(
            String search,
            UrlStatus status,
            Pageable pageable
    ) {
        var owner = (AccountPrincipal) SecurityContextHolder
                .getContext()
                .getAuthentication()
                .getPrincipal();

        return urls.findAll(
                SearchSpecifications.urls(
                        owner.getId(),
                        search,
                        status
                ),
                pageable
        ).map(ShortUrlResponse::from);
    }

    public ShortUrlResponse get(Long id) {
        return ShortUrlResponse.from(
                access.requireOwnedUrl(id)
        );
    }

    @Transactional
    public ShortUrlResponse update(
            Long id,
            UpdateUrlRequest request
    ) {
        var url = access.requireOwnedUrl(id);

        if (request.active() == null
                && request.expiresAt() == null) {
            throw badRequest("Provide active or expiresAt");
        }

        Instant now = Instant.now();

        if (request.expiresAt() != null
                && !request.expiresAt().isAfter(now)) {
            throw badRequest(
                    "Expiration date must be in the future"
            );
        }

        boolean active = request.active() == null
                ? url.isActive()
                : request.active();

        Instant expiresAt = request.expiresAt() == null
                ? url.getExpiresAt()
                : request.expiresAt();

        if (Boolean.TRUE.equals(request.active())
                && expiresAt != null
                && !expiresAt.isAfter(now)) {
            throw badRequest(
                    "Provide a future expiration date "
                            + "to reactivate an expired URL"
            );
        }

        int updated = urls.updateSettings(
                id,
                url.getUser().getId(),
                active,
                expiresAt
        );

        if (updated == 0) {
            throw new ResponseStatusException(
                    HttpStatus.NOT_FOUND,
                    "URL not found"
            );
        }

        return get(id);
    }

    @Transactional
    public void delete(Long id) {
        urls.delete(access.requireOwnedUrl(id));
    }

    @Transactional
    public void bulkSetActive(List<Long> ids, boolean active) {
        Long ownerId = requireOwnedSelection(ids);
        Instant now = Instant.now();
        // The conditional update rechecks expiration at write time. An incomplete
        // update throws within this transaction, rolling back the entire selection.
        if (urls.updateActiveForOwner(ownerId, ids, active, now) != ids.size()) {
            throw badRequest("Provide a future expiration date before enabling expired URLs");
        }
    }

    @Transactional
    public void bulkDelete(List<Long> ids) {
        Long ownerId = requireOwnedSelection(ids);
        if (urls.deleteForOwner(ownerId, ids) != ids.size()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "URL not found");
        }
    }

    private Long requireOwnedSelection(List<Long> ids) {
        if (new HashSet<>(ids).size() != ids.size()) {
            throw badRequest("URL IDs must be unique");
        }
        var owner = (AccountPrincipal) SecurityContextHolder.getContext()
                .getAuthentication().getPrincipal();
        // Lock in a stable order so concurrent edits/deletions cannot change the
        // selection between the ownership check and the bulk write.
        if (urls.findByUserIdAndIdInOrderByIdAsc(owner.getId(), ids).size() != ids.size()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "URL not found");
        }
        return owner.getId();
    }

    private ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                message
        );
    }
}
