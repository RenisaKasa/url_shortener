package com.urlshortener.url_shortener.repository;

import com.urlshortener.url_shortener.entity.ShortUrl;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ShortUrlRepository extends JpaRepository<ShortUrl, Long> {

    Optional<ShortUrl> findByShortCode(String shortCode);

    Optional<ShortUrl> findByIdAndUserId(Long id, Long userId);

    boolean existsByShortCode(String shortCode);

    List<ShortUrl> findByUserId(Long userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update ShortUrl u
            set u.clickCount = u.clickCount + 1,
                u.lastAccessedAt = :now
            where u.id = :id
              and u.active = true
              and (u.expiresAt is null or u.expiresAt > :now)
            """)
    int recordClick(@Param("id") Long id, @Param("now") Instant now);
}