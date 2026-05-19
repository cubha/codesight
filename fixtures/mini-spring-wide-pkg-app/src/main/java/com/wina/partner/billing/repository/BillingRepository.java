package com.wina.partner.billing.repository;

import com.wina.partner.billing.domain.Billing;
import org.springframework.data.jpa.repository.JpaRepository;

public interface BillingRepository extends JpaRepository<Billing, Long> {
}
