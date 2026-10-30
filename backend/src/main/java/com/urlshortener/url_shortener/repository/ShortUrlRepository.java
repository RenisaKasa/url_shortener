package com.urlshortener.url_shortener.repository;

import com.urlshortener.url_shortener.entity.ShortUrl;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface ShortUrlRepository extends JpaRepository<ShortUrl, Long> {

    Optional<ShortUrl> findByShortCode(String shortCode);

    Optional<ShortUrl> findByIdAndUserId(Long id, Long userId);

    boolean existsByShortCode(String shortCode);

    List<ShortUrl> findByUserId(Long userId);
}
