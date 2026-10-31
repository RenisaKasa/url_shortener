package com.urlshortener.url_shortener.query;

import com.urlshortener.url_shortener.dto.UrlStatus;
import com.urlshortener.url_shortener.entity.Role;
import com.urlshortener.url_shortener.entity.ShortUrl;
import com.urlshortener.url_shortener.entity.User;

import jakarta.persistence.criteria.Predicate;

import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Locale;

public final class SearchSpecifications {

    private SearchSpecifications() {}

    public static Specification<ShortUrl> urls(
            Long ownerId,
            String search,
            UrlStatus status
    ) {
        String pattern = searchPattern(search);
        Instant now = Instant.now();

        if (ownerId != null && ownerId <= 0) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "userId must be positive"
            );
        }

        return (root, query, cb) -> {
            var conditions = new ArrayList<Predicate>();

            if (ownerId != null) {
                conditions.add(
                        cb.equal(root.get("user").get("id"), ownerId)
                );
            }

            if (pattern != null) {
                conditions.add(cb.or(
                        cb.like(
                                cb.lower(root.get("originalUrl")),
                                pattern,
                                '!'
                        ),
                        cb.like(
                                cb.lower(root.get("shortCode")),
                                pattern,
                                '!'
                        )
                ));
            }

            Predicate expired = cb.and(
                    cb.isNotNull(root.get("expiresAt")),
                    cb.lessThanOrEqualTo(
                            root.<Instant>get("expiresAt"),
                            now
                    )
            );

            Predicate notExpired = cb.or(
                    cb.isNull(root.get("expiresAt")),
                    cb.greaterThan(
                            root.<Instant>get("expiresAt"),
                            now
                    )
            );

            if (status != null) {
                conditions.add(switch (status) {
                    case ACTIVE -> cb.and(
                            cb.isTrue(root.get("active")),
                            notExpired
                    );
                    case INACTIVE -> cb.and(
                            cb.isFalse(root.get("active")),
                            notExpired
                    );
                    case EXPIRED -> expired;
                });
            }

            return cb.and(conditions.toArray(Predicate[]::new));
        };
    }

    public static Specification<User> users(
            String search,
            Boolean active,
            Role role
    ) {
        String pattern = searchPattern(search);

        return (root, query, cb) -> {
            var conditions = new ArrayList<Predicate>();

            if (pattern != null) {
                conditions.add(cb.like(
                        cb.lower(root.get("email")),
                        pattern,
                        '!'
                ));
            }

            if (active != null) {
                conditions.add(
                        cb.equal(root.get("active"), active)
                );
            }

            if (role != null) {
                conditions.add(
                        cb.equal(root.get("role"), role)
                );
            }

            return cb.and(conditions.toArray(Predicate[]::new));
        };
    }

    private static String searchPattern(String search) {
        if (search == null || search.isBlank()) {
            return null;
        }

        if (search.length() > 200) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Search must not exceed 200 characters"
            );
        }

        // Escape SQL LIKE wildcards so searches remain literal.
        String escaped = search.trim()
                .toLowerCase(Locale.ROOT)
                .replace("!", "!!")
                .replace("%", "!%")
                .replace("_", "!_");

        return "%" + escaped + "%";
    }
}