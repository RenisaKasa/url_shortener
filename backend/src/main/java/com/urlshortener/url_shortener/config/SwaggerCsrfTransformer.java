package com.urlshortener.url_shortener.config;

import jakarta.servlet.http.HttpServletRequest;
import org.springdoc.core.properties.SwaggerUiConfigProperties;
import org.springdoc.core.properties.SwaggerUiOAuthProperties;
import org.springdoc.core.providers.ObjectMapperProvider;
import org.springdoc.webmvc.ui.SwaggerIndexPageTransformer;
import org.springdoc.webmvc.ui.SwaggerWelcomeCommon;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.resource.ResourceTransformerChain;
import org.springframework.web.servlet.resource.TransformedResource;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/** Adds the same session CSRF flow used by the frontend to Swagger's Try it out requests. */
@Component
public class SwaggerCsrfTransformer extends SwaggerIndexPageTransformer {
    private final String interceptor;

    public SwaggerCsrfTransformer(SwaggerUiConfigProperties config, SwaggerUiOAuthProperties oauth,
                                  SwaggerWelcomeCommon welcome, ObjectMapperProvider mapper) throws IOException {
        super(config, oauth, welcome, mapper);
        interceptor = new ClassPathResource("swagger/csrf-interceptor.js")
                .getContentAsString(StandardCharsets.UTF_8);
    }

    @Override
    public Resource transform(HttpServletRequest request, Resource resource,
                              ResourceTransformerChain chain) throws IOException {
        Resource transformed = super.transform(request, resource, chain);
        if (!"swagger-initializer.js".equals(resource.getFilename())) return transformed;

        String script = transformed.getContentAsString(StandardCharsets.UTF_8);
        script = script.replace("SwaggerUIBundle({", "SwaggerUIBundle({\nrequestInterceptor: " + interceptor + ",");
        return new TransformedResource(resource, script.getBytes(StandardCharsets.UTF_8));
    }
}
