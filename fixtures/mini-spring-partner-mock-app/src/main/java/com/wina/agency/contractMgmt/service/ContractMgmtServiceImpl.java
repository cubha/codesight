package com.wina.agency.contractMgmt.service;

import com.wina.agency.contractMgmt.repository.ContractMgmtRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class ContractMgmtServiceImpl implements ContractMgmtService {
    @Autowired
    private ContractMgmtRepository contractMgmtRepository;

    @Override
    public Object retrieveContractList() { return contractMgmtRepository.retrieveContractList(); }

    @Override
    public Object retrieveContractDetail() { return contractMgmtRepository.retrieveContractDetail(); }

    @Override
    public Object saveContract() { return contractMgmtRepository.saveContract(); }
}
