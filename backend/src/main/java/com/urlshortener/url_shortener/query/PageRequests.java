package com.urlshortener.url_shortener.query;

import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.Set;

public final class PageRequests {

    private static final Set<String> URL_FIELDS = Set.of(
            "id",
            "originalUrl",
            "shortCode",
            "active",
            "createdAt",
            "expiresAt",
            "clickCount",
            "lastAccessedAt"
    );

    private static final Set<String> USER_FIELDS = Set.of(
            "id",
            "email",
            "role",
            "active"
    );

    private PageRequests() {}

    public static Pageable urls(int page, int size, String sort) {
        return checked(page, size, sort, URL_FIELDS);
    }

    public static Pageable users(int page, int size, String sort) {
        return checked(page, size, sort, USER_FIELDS);
    }

    private static Pageable checked(
            int page,
            int size,
            String sort,
            Set<String> allowedFields
    ) {
        if (page < 0
                || size < 1
                || size > 100
                || (long) page * size > Integer.MAX_VALUE) {
            throw badRequest(
                    "page must be >= 0 and size must be between 1 and 100"
            );
        }

        String[] parts = sort.split(",", -1);

        if (parts.length > 2
                || !allowedFields.contains(parts[0].trim())) {
            throw badRequest(
                    "Invalid sort field. Allowed fields: "
                            + String.join(", ", allowedFields)
            );
        }

        Sort.Direction direction;

        try {
            direction = parts.length == 2
                    ? Sort.Direction.fromString(parts[1].trim())
                    : Sort.Direction.ASC;
        } catch (IllegalArgumentException exception) {
            throw badRequest("Sort direction must be asc or desc");
        }

        String field = parts[0].trim();
        Sort ordering = Sort.by(direction, field);

        // Stable ordering when multiple records have the same sort value.
        if (!field.equals("id")) {
            ordering = ordering.and(Sort.by("id"));
        }

        return PageRequest.of(page, size, ordering);
    }

    private static ResponseStatusException badRequest(String message) {
        return new ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                message
        );
    }
}