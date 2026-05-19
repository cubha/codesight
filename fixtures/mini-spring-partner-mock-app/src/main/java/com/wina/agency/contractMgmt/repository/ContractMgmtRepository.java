package com.wina.agency.contractMgmt.repository;

import org.apache.ibatis.annotations.Mapper;
import java.util.List;
import java.util.Map;

@Mapper
public interface ContractMgmtRepository {
    List<Map<String, Object>> retrieveContractList();
    Map<String, Object> retrieveContractDetail();
    int saveContract();
}
