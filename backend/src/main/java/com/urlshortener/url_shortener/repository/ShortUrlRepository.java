package com.urlshortener.url_shortener.repository;

import com.urlshortener.url_shortener.entity.ShortUrl;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import com.urlshortener.url_shortener.dto.DashboardStatisticsResponse;
import java.time.Instant;
import java.util.List;
import java.util.Optional;

public interface ShortUrlRepository extends
        JpaRepository<ShortUrl, Long>,
        JpaSpecificationExecutor<ShortUrl> {

    Optional<ShortUrl> findByShortCode(String shortCode);

    Optional<ShortUrl> findByIdAndUserId(Long id, Long userId);

    boolean existsByShortCode(String shortCode);

    List<ShortUrl> findByUserId(Long userId);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("""
            update ShortUrl u
            set u.active = :active,
                u.expiresAt = :expiresAt
            where u.id = :id
              and u.user.id = :ownerId
            """)
    int updateSettings(
            @Param("id") Long id,
            @Param("ownerId") Long ownerId,
            @Param("active") boolean active,
            @Param("expiresAt") Instant expiresAt
    );

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


    @Query("""
        select
            count(u) as totalUrls,
            coalesce(sum(
                case
                    when u.active = true
                        and (u.expiresAt is null or u.expiresAt > :now)
                    then 1L
                    else 0L
                end
            ), 0L) as activeUrls,
            coalesce(sum(
                case
                    when u.expiresAt is not null
                        and u.expiresAt <= :now
                    then 1L
                    else 0L
                end
            ), 0L) as expiredUrls,
            coalesce(sum(u.clickCount), 0L) as totalClicks
        from ShortUrl u
        where u.user.id = :userId
        """)
    DashboardStatistics getDashboardStatistics(
            @Param("userId") Long userId,
            @Param("now") Instant now
    );
}
