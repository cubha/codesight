package com.wina.partner.vendor.repository;

import com.wina.partner.vendor.domain.Vendor;
import org.springframework.data.jpa.repository.JpaRepository;

public interface VendorRepository extends JpaRepository<Vendor, Long> {
}
