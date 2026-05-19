package com.wina.partner.pricing.repository;

import com.wina.partner.pricing.domain.Pricing;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PricingRepository extends JpaRepository<Pricing, Long> {
}
