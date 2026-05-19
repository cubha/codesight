package com.wina.partner.loyalty.repository;

import com.wina.partner.loyalty.domain.Loyalty;
import org.springframework.data.jpa.repository.JpaRepository;

public interface LoyaltyRepository extends JpaRepository<Loyalty, Long> {
}
